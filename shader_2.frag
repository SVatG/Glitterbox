#version 420

out vec4 f;
in vec4 gl_Color;
uniform vec2 res;
uniform float envelope;
uniform float envelope_lp;
uniform float envelope_lp_sum;
uniform float part;
uniform float note;

layout(size4x32,binding=0) uniform image2D imageTexture;
layout(binding=1) uniform sampler2D imageSampler;

layout(size4x32,binding=1) uniform image2D imageTexture2;
layout(binding=2) uniform sampler2D imageSampler2;

layout(size4x32,binding=2) uniform image2D outTexture;
layout(binding=3) uniform sampler2D outSampler;

// Various knobs to twiddle
#define MIN_DIST 0.01
#define STEP_MULTIPLIER 0.9
#define NORMAL_OFFSET 0.01
#define MAX_STEPS 64
#define MAX_STEPS_SHADOW 32
#define SHADOW_OFFSET 0.02
#define SHADOW_HARDNESS 32.0

float rand(vec2 co){
	return(fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453));
}

// Trefoil knot positions
vec3 trefoil(float t) {
	return vec3(
        sin(t) + 2.0 * sin(2.0 * t),
        cos(t) - 2.0 * cos(2.0 * t),
        -sin(3.0 * t)
    );
}

// Distance / color combiner
vec4 distcompose(vec4 dista, vec4 distb, float softness) {
	float mixfact = clamp(0.5 + 0.5 * (distb.a - dista.a) / softness, 0.0, 1.0);
	return mix(distb, dista, mixfact) - vec4(0.0, 0.0, 0.0, softness * mixfact * (1.0 - mixfact));
}

vec3 hsv2rgb(vec3 c)
{
	vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// World
vec4 distfunc(vec3 pos) {
	float t = gl_Color.x * 3000.0 * 10.0;
	float effselect = gl_Color.y * 65536.0;

  	vec4 box = vec4(0.0);

	float bright = 0.99;
	if(part >= 15.0) {
		bright *= (1.0 - mod(part, 1.0));
	}
	if(part >= 16.0) {
		bright = 0.00;
	}

	box.xyz = vec3(fract(pos.x + pos.z * 2.0) > 0.95 ? bright : bright / 99.0);
	box.a = min(min(pos.y, -abs(pos.z) + 2.0), -abs(pos.x) + 2.0);

	if(box.x == 0.99 && (((pos.x + pos.z * 2.0) + 5.0) > (note - 80)) && (((pos.x + pos.z * 2.0) + 4.0) < (note - 80))) {
		box.xyz *= 3.0;
	}

	pos = pos - vec3(0.0, 1.0, 0.0);
	
	float r = 0.0001;
	if(part >= 11.0) {
		r = (part - 11.0) / 2.0;
	}
	if(part > 13.0) {
		r = 1.0;
	}
	
	vec3 q = abs(pos / 1.5 / r) - vec3(0.15);
	vec4 box2 = vec4(1.0);
	box2.a = length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0) - 0.03;

	vec4 dist = distcompose(box, box2, 0.0);
	
	return(dist);
}

mat4 lookatmat(vec3 eye, vec3 center, vec3 up) {
	vec3 backward=normalize(eye - center);
	vec3 right=normalize(cross(up,backward));
	vec3 actualup=normalize(cross(backward,right));

	return mat4(
		vec4(right, -dot(right, eye)), 
		vec4(actualup, -dot(actualup, eye)), 
		vec4(backward, -dot(backward, eye)),
		vec4(0.0, 0.0, 0.0, 1.0)
	);
}

vec3 lookat = vec3(0.0, 0.85, 0.0);
vec3 campos(float t) {
	float wobble = t * 0.2;
	return(vec3(sin(wobble) * -1.75, 2.4, cos(wobble) * -1.75));
}

// Renderer
vec4 pixel(vec2 fragCoord, out float depth) {
	float t = gl_Color.x * 3000.0 * 10.0;

	// Screen -1 -> 1 coordinates
	vec2 coords = (2.0 * fragCoord.xy - res) / res.x;

	// Camera as eye + imaginary screen at a distance
	vec3 eye = campos(t * 0.5);
	vec3 lightpos = eye;
	lightpos.y += 2.0;
    
	float sinpow = sin(t * 5.0);
	sinpow = sinpow * sinpow;
    
	//eye.x += sinpow * 0.01;

	//vec3 looksfsddir = normalize(lookat - eye);
	eye = (vec4(0.0, 0.0, 0.0, 1.0) * inverse(lookatmat(eye, lookat, vec3(0.0, 1.0, 0.0)))).xyz;
	vec3 lookdir = normalize((vec4(0.0, 0.0, -1.0, 0.0) * inverse(lookatmat(eye, lookat, vec3(0.0, 1.0, 0.0)))).xyz);

	vec3 left = normalize(cross(lookdir, vec3(0.0, 1.0, 0.0)));
	vec3 up = normalize(cross(left, lookdir));
	vec3 lookcenter = eye + lookdir;
	vec3 pixelpos = lookcenter + coords.x * left + coords.y * up;
	vec3 ray = normalize(pixelpos - eye);
    
	// March
	vec3 pos = eye;
	float dist = 0.0;
	float curdist = 1.0;
	float iters = float(MAX_STEPS);
	for(int i = 0; i < MAX_STEPS; i++) {
		curdist = distfunc(pos).a;
		dist += curdist * STEP_MULTIPLIER;
		pos = eye + ray * dist;
		if(curdist < MIN_DIST) {
        	iters = float(i);
			break;
		}
	}
    
	// Finite-difference normals
   	vec2 d = vec2(NORMAL_OFFSET, 0.0);
	vec3 normal = normalize(vec3(
		distfunc(pos + d.xyy).a - distfunc(pos - d.xyy).a,
		distfunc(pos + d.yxy).a - distfunc(pos - d.yxy).a,
		distfunc(pos + d.yyx).a - distfunc(pos - d.yyx).a
	));
    
	// Shading
	float light = max(0.0, dot(normal,  normalize(lightpos - pos))) + 0.1;
	vec3 colorval = light * distfunc(pos).rgb;
   
	// Calculate CoC (limited to a maximum size) and store
	depth = length(pos - eye);
	vec4 fragColor = vec4(colorval.xyz, 0.0);
	float coc = pow(0.7 * abs(1.0 - 1.0 / depth), 2.0);
	coc = max(0.01 * 5.0, min(0.35 * 5.0, coc));
	if(part >= 15.0) {
		coc *= (1.0 - mod(part, 1.0));
	}
	if(part >= 16.0) {
		coc = 0.01;
	}
	return(vec4(fragColor.rgb, coc));
}

// Image
void main() {
	// Screenspace pos 
	vec2 v = gl_FragCoord.xy / res;

	float t = gl_Color.x * 3000.0 * 10.0;

	// Render what?
	if(gl_Color.w < 0.5) {
		// Render box
		float depth;
		f = pixel(gl_FragCoord.xy, depth);

		// Preload dir here for HACKS reasons
		vec3 dir = texture(imageSampler2, v.xy).xyz;

		// Move particles
		if(gl_FragCoord.y <= 512) {
			vec3 eye = campos(t * 0.5);
			mat4 cam = lookatmat(eye, lookat, vec3(0.0, 1.0, 0.0));

			float ms = gl_Color.z * 10000.0;
			if(part <= 3) {
				ms = 0.0;
			}

			// Update particles
			vec4 old = texture(imageSampler, v.xy);
			vec4 new = old + vec4(dir, 0.0) * ms;

			// Block particles
			vec3 pos = new.xyz;
			
			vec2 pd = vec2(ms, 0.0);
			vec3 displace = vec3(
				distfunc(pos-pd.xyy).w - distfunc(pos+pd.xyy).w,
				distfunc(pos-pd.yxy).w - distfunc(pos+pd.yxy).w,
				distfunc(pos-pd.yyx).w - distfunc(pos+pd.yyx).w
			);
			if(distfunc(pos).w < 0.0) {
				new.xyz -= normalize(displace) * ms * 1.2;
				dir = reflect(dir, normalize(displace)) * 0.4;
			}

			// Gravity field
			vec3 dir1 = vec3(0.0);
			for(float p = 0.0; p < 2.0 * 3.14; p += 2.1) {
				vec3 tre = trefoil(p) * 0.8 + vec3(0.0, 1.2, 0.0);
				dir1 += normalize(pos - tre) * 0.1 / sqrt(length(pos - tre));
			}
			vec3 dir2 = vec3(cos(t + pos.y * 10.0), ms * 1000.0, sin(t + pos.y * 10.0)) * 0.005;
			
			if(part >= 10.0 && part <= 14.0) {
				dir -= dir1;
			}
			else {
				dir -= dir2;
			}
			
			if( part < 8.0) {
				dir += normalize(pos - vec3(0.0, 1.2, 0.0)) * envelope_lp * 0.2 * sin(t * 0.3);
			}

			//dir -= normalize(vec3(pos) - vec3(0.0, 1.0, 0.0)) * 0.1 * sqrt(length(vec3(pos) - vec3(0.0, 1.0, 0.0)));

			// Terminal velocity
			if(length(dir) > 10.0) {
				dir -= normalize(dir) * 10.0;
			}


			imageStore(imageTexture, ivec2(gl_FragCoord.xy), new);

			float depth = length(new.xyz - eye);
			vec3 outPos = (vec4(new.xyz, 1.0) * cam).xyz;
			imageStore(outTexture, ivec2(gl_FragCoord.xy), vec4(outPos, depth));
		}

		// Direction of particle but also depth of fragment in w. Sorry, future reader.
		imageStore(imageTexture2, ivec2(gl_FragCoord.xy), vec4(dir, depth));
	}
	else {
		// Frag depths
		float origDepth = texture(imageSampler2, v.xy).w;
		float partDepth = gl_Color.x * 100000.0;
		float partId =  gl_Color.y * (1280.0 * 720.0);

		// Render particles
		vec2 pos = gl_PointCoord.xy - vec2(0.5);
		float radius = length(pos);
		if(radius > 0.5 || origDepth < partDepth) {
			discard;
		}

		
		vec3 col = vec3(10.0, 25.0 * (sin(partId / 1000.0) + 1.0), 25.0 * (cos(partId / 2000.0) + 1.0));
		if(part >= 9.0 && partId < mod(part, 1.0) * 1280.0 * 1024.0 || part >= 10.0 ) {
			col = vec3(25.0 * (sin(partId / 1000.0) + 1.0), 10.0, 25.0 * (cos(partId / 2000.0) + 1.0));
		}

		if(mod(partId, 500.0) > 1.1) {
			col /= 40.0;
		}

		if(part <= 2) {
			col = vec3(0.1);
		}



		float coc = 0.01 + pow(0.7 * abs(1.0 - 1.0 / partDepth), 2.0);
		//coc = max(0.01 * 5.0, min(0.35 * 5.0, coc));

		f = vec4(col * (0.5 - radius), coc);
		// f = vec4(partDepth * 0.1);
	}
}
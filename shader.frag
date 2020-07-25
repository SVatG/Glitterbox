#version 420

out vec4 f;
layout(binding=0) uniform sampler2D postproc;
layout(binding=4) uniform sampler2D text1;
layout(binding=5) uniform sampler2D text2;
uniform vec2 res;
uniform float shift;
in vec4 gl_Color;
uniform float part;
uniform float envelope;
uniform float envelope_lp;
uniform float envelope_lp_sum;

vec3 hexablur(sampler2D tex, vec2 uv) {
	vec2 scale = vec2(1.0) / res;
	vec3 col = vec3(0.0);
	float asum = 0.0;
	float coc = texture(tex, uv).a;
	for(float t = 0.0; t < 8.0 * 2.0 * 3.14; t += 3.14 / 32.0) {
    	float r = cos(3.14 / 6.0) / cos(mod(t, 2.0 * 3.14 / 6.0) - 3.14 / 6.0);
        
		// Tap filter once for coc
		vec2 offset = vec2(sin(t), cos(t)) * r * t * scale * coc;
		vec4 samp = texture(tex, uv + offset * 1.0);
        
		// Tap filter with coc from texture
		offset = vec2(sin(t), cos(t)) * r * t * scale * samp.a;
		samp = texture(tex, uv + offset * 1.0);
        
		// weigh and save
		col += samp.rgb * samp.a * t;
		asum += samp.a * t;
        
	}
	col = col / asum;
	return(col);
}

float atten (float v) { return 1.0 - pow( abs( ( abs(v * 2.0 - 1.0) - .35 ) * 1.9), 6.0 ); }

void main() {
	float t = gl_Color.x * 3000.0 * 10.0;

	f = vec4(1.0, 0.0, 0.2, 0.0);
	vec2 uv = gl_FragCoord.xy/res;
	if(part < 1.0) {
		f = texture(postproc, uv);
	}
	else {
		f = vec4(hexablur(postproc, uv), 0.0);
	}
	//f = texture(postproc, uv);

	// Tonemap and gamma-correct
	f = f / (f + vec4(1.0));
	f.rgb = vec3(pow(f.r, 1.0 / 2.2), pow(f.g, 1.0 / 2.2), pow(f.b, 1.0 / 2.2));
	f.rgb *= atten( uv.x ) + atten( uv.y * 1.05 - 0.05);

	vec3 scroll_color = vec3(0.0);
	float shiftr = shift + fract(sin(uv.y * 12312.242 + t * 100212.2)) * (0.45 - abs(envelope)) * 0.02;
	if(part >= 14.0) {
		 shiftr = shift;
	}
	float cosx = (1.0 - smoothstep(0.9, 1.0, uv.x)) * 0.075 + 0.745 + smoothstep(0.0, 0.1, uv.x) * 0.075;
	if(uv.x <  1.0 - shiftr) {
		scroll_color += vec3(0.9, 0.9, 0.9) * (1.0 - texture(text1, uv + vec2(shiftr, cosx)).r);
		scroll_color += vec3(0.0, 0.9, 0.9) * (1.0 - texture(text1, uv + vec2(shiftr + 0.002, cosx + 0.002)).r);
		scroll_color += vec3(0.9, 0.0, 0.9) * (1.0 - texture(text1, uv + vec2(shiftr - 0.002, cosx - 0.002)).r);
	}
	else {
		scroll_color += vec3(0.9, 0.9, 0.9) * (1.0 - texture(text2, uv + vec2(-1.00 + shiftr, cosx)).r);
		scroll_color += vec3(0.0, 0.9, 0.9) * (1.0 - texture(text2, uv + vec2(-1.00 + shiftr + 0.002, cosx + 0.002)).r);
		scroll_color += vec3(0.9, 0.0, 0.9) * (1.0 - texture(text2, uv + vec2(-1.00 + shiftr - 0.002, cosx - 0.002)).r);
	}
	if(length(scroll_color) > 0.0) {
		f.rgb = scroll_color;
	}

	f.rgb *= mod(uv.y * res.y / 4.0, 1.0) < 0.5 ? 0.5 : 1.0; 
}
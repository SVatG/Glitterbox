nasmw.exe -fwin32 -o"4klang.obj" 4klang.asm

crinkler.exe /OUT:4klang.exe /CRINKLER /PRIORITY:NORMAL /COMPMODE:FAST /PROGRESSGUI /TRANSFORM:CALLS /PRINT:IMPORTS /PRINT:LABELS /REPORT:report.html /ORDERTRIES:00000 /HASHTRIES:20 /HASHSIZE:100 /TRUNCATEFLOATS:32 main.obj 4klang.obj user32.lib kernel32.lib winmm.lib
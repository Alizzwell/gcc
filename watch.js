const fs = require('fs');
const spawn = require('child_process').spawn;

const gdb = spawn('gdb', ['a.out']);
gdb.stdin.write('watch K\n');
gdb.stdin.write('watch cnt\n');
gdb.stdin.write('watch card\n');
gdb.stdin.write('set listsize 1\n');
gdb.stdin.write('break main\n');
gdb.stdin.write('run < input.txt\n');

var run = true;
var logging = false;
var buf = new String();
const log = fs.createWriteStream('output.log', {flag: 'w'});

var mode = 0;

gdb.stdout.on('data', (data) => {
	if (!run) return;

	buf += data;

	if (!logging) {
		if (buf.match(/Breakpoint 1, main \(\)(.|\n)*\(gdb\) $/g) > -1) {
			// TODO: print initialized data
			logging = true;
			buf = "";
			gdb.stdin.write('step\n');
		}
		return;
	}

	if (buf.match(/\n\(gdb\) $/g)) {
		buf = buf.replace(/\n\(gdb\) $/g, '');
		
		if (mode == 0) {
			buf = "";
			mode = 1;
			gdb.stdin.write('info line\n');
			return;
		}

		if (mode == 1) {
			if (buf.indexOf('test.cpp') > -1) {
				buf = "";
				mode = 2;
				gdb.stdin.write('l\n');
			}
			else {
				buf = "";
				mode = 0;
				gdb.stdin.write('finish\n');
			}
			return;
		}

		if (mode == 2) {
			log.write("line:\n" + buf + "\n");
			buf = "";
			mode = 3;
			gdb.stdin.write('display\n');
			return;
		}

		if (mode == 3) {
			log.write("display:\n" + buf + "\n");
			buf = "";
			mode = 0;
			gdb.stdin.write('step\n');
			return;
		}
	}
});

gdb.stderr.on('data', (data) => {
	if (data.toString().indexOf("libc-start.c") > -1) {
		run = false;
		gdb.stdin.write('Quit\n');
	}
});

gdb.on('close', (code) => {
	console.log(`child process exited with code ${code}`);
});

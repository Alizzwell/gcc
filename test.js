const spawn = require('child_process').spawn;


const argv = (function parseProcessArgument() {
	var binaryfile = process.argv[2];
	var targets = [];
	var breaks = [];
	var inputTxt;

	var mode = 0;
	for (var i = 3; i < process.argv.length; i++) {
		if (process.argv[i] === '--targets' || process.argv[i] === '-t') {
			mode = 1;
		}
		else if (process.argv[i] === '--breaks' || process.argv[i] === '-b') {
			mode = 2;
		}
		else if (process.argv[i] === '--input' || process.argv[i] == '-i') {
			mode = 0;
			inputTxt = process.argv[++i];
		}
		else {
			if (mode == 1) targets.push(process.argv[i]);
			if (mode == 2) breaks.push(process.argv[i]);
		}
	}

	return {
		binaryfile: binaryfile,
		targets: targets,
		breaks: breaks,
		inputTxt: inputTxt
	};
})();



const gdb = spawn('gdb', [argv.binaryfile]);


(function gdbConfigurationAndRun(argv) {
	argv.targets.forEach((target) => {
		gdb.stdin.write(`display ${target}\n`);
	});

	gdb.stdin.write('set listsize 1\n');
	gdb.stdin.write('break main\n');

	argv.breaks.forEach((breakpoint) => {
		// TODO: use break point mode..
	});

	gdb.stdin.write(`run < ${argv.inputTxt}\n`);
})(argv);



(function gdbProcessing() {
	var logging = false;
	var run = true;
	var buf = new String();
	var mode = 0;

	gdb.stdout.on('data', (data) => {
		if (!run) return;

		buf += data;

		if (!logging) {
			if (buf.match(/Breakpoint 1, main \(\)(.|\n)*\(gdb\) $/g) > -1) {
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
				buf = "";
				mode = 3;
				gdb.stdin.write('display\n');
				return;
			}

			if (mode == 3) {
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
})();

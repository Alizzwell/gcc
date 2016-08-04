const argv = (function parseProcessArgument() {
	var sourcefile = process.argv[2];
	var binaryfile = process.argv[3];
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
		"sourcefile": sourcefile,
		"binaryfile": binaryfile,
		"targets": targets,
		"breaks": breaks,
		"inputTxt": inputTxt
	};
})();


gdbStart(argv, gdbPipeline, function done(gdb, argv, result) {
	console.log(JSON.stringify(result));
	process.exit(0);
});


function gdbPipeline(gdb, argv, done) {
	gdbGetTypeEachTargets(
		gdbConfigurationAndRun(
			gdbProcessing(
				done
			)
		)
	)(gdb, argv);
}


function gdbStart(argv, pipeline, done) {
	const spawn = require('child_process').spawn;
	const gdb = spawn('gdb', [argv.binaryfile]);

	var buf = new String();
	var dataListener = (data) => {
		buf += data;
		if (getCompleteStreamData(buf)) {
			gdb.stdout.removeListener('data', dataListener);
			pipeline(gdb, argv, done);
		}
	};

	gdb.stdout.on('data', dataListener);
}


function gdbGetTypeEachTargets(next) {

	return function (gdb, argv, result) {
		var buf = new String();
		var output;
		var targets = {};
		var t = undefined;
		var i = 0;

		if (!argv.targets) {
			return next(gdb, argv, result);
		}

		var dataListener = (data) => {
			buf += data;
			if (output = getCompleteStreamData(buf)) {
				buf = "";

				var type = output.split('=')[1].trim();
				const arrsize = type.match(/[[0-9]+]/g);
				type = type.replace(/[[0-9]+]/g, '').trim();

				targets[t] = {
					"type": type
				};

				if (arrsize) {
					targets[t].array = [];
					arrsize.forEach((size) => {
						targets[t].array.push(Number(size.replace(/(\[|\])/g, '')));
					});
				}

				t = argv.targets[i++];
				if (!t) {
					result = result || {};
					result.targets = targets;
					gdb.stdout.removeListener('data', dataListener);
					return next(gdb, argv, result);
				}
				gdb.stdin.write(`ptype ${t}\n`);
			}
		};

		gdb.stdout.on('data', dataListener);
		t = argv.targets[i++];
		gdb.stdin.write(`ptype ${t}\n`);
	};

}


function gdbConfigurationAndRun(next) {

	return function (gdb, argv, result) {
		var buf = new String();

		var dataListener = (data) => {
			buf += data;
			if (buf.match(/Breakpoint 1, main \((.|\n)*\(gdb\) $/g)) {
				gdb.stdout.removeListener('data', dataListener);
				next(gdb, argv, result);
			}
		};

		gdb.stdout.on('data', dataListener);

		argv.targets.forEach((target) => {
			gdb.stdin.write(`display ${target}\n`);
		});

		gdb.stdin.write('set listsize 1\n');
		gdb.stdin.write('break main\n');

		// Configuration
		argv.breaks.forEach((breakpoint) => {
			gdb.stdin.write(`break ${breakpoint}\n`);
		});

		if (argv.inputTxt) {
			gdb.stdin.write(`run < ${argv.inputTxt}\n`);
		}
		else {
			gdb.stdin.write('run\n');
		}
	}
}


function gdbProcessing(next) {

	return function (gdb, argv, result) {
		var buf = new String();
		var output;
		var mode = 0;

		var steps = [];
		var status;
		var line;

		var dataListener = (data) => {
			buf += data;

			if (output = getCompleteStreamData(buf)) {			
				buf = "";
				if (output.indexOf("exited normally") > -1){
					gdb.stdout.removeListener('data', dataListener);
					gdb.stdin.write('Quit\n');
					return ;
				}
				
				if (mode == 0) {
					mode = 1;
					gdb.stdin.write('info line\n');
					return;
				}

				if (mode == 1) {
					if (output.indexOf(argv.sourcefile) > -1) {
						mode = 2;
						gdb.stdin.write('list\n');
					}
					else {
						mode = 0;
						gdb.stdin.write('finish\n');
					}
					return;
				}

				if (mode == 2) {
					line = parseLineNumberFromLine(output);
					mode = 3;
					gdb.stdin.write('display\n');
					return;
				}

				if (mode == 3) {
					status = parseStatusEachValues(output, result.targets);
					steps.push({ "line": line, "status": status });
					mode = 0;
					if(argv.breaks.length == 0){
						 gdb.stdin.write('step\n');
					}
					else{
						gdb.stdin.write('continue\n');
					}
					return;
				}
			}
		};

		gdb.stdout.on('data', dataListener);

		gdb.stderr.on('data', (data) => {
			if (data.toString().indexOf("libc-start.c") > -1) {
				gdb.stdout.removeListener('data', dataListener);
				gdb.stdin.write('Quit\n');
			}
		});

		gdb.on('close', (code) => {
			result = result || {};
			result.steps = steps;
			// console.log(`child process exited with code ${code}`);
			if (code != 0) process.exit(1);
			next(gdb, argv, result);
		});

		mode = 1;
		gdb.stdin.write('info line\n');
	}
}


function parseLineNumberFromLine(line) {
	return Number(line.match(/^[0-9]+/g)[0]);
}


function parseStatusEachValues(status, targets) {
	var ret = {};
	status.split(/[0-9]+: /g).slice(1).forEach((line) => {
		var split = line.replace('\n', '').split('=');
		var key = split[0].trim();
		var value = convertStringToTargetData(split[1].trim(), targets[key]);
		ret[key] = value;
	});
	return ret;
}


function getCompleteStreamData(str) {
	if (str.match(/\n\(gdb\) $/g)) {
		return str.replace(/\n\(gdb\) $/g, '');
	}
	return false;
}


function convertStringToTargetData(str, target) {
	if (target.array) {
		str = str.replace(/{/g, '[').replace(/}/g, ']');
		return JSON.parse(str);
	}
	else {
		const type = target.type;
		switch (type) {
			case 'char': return str;
			default: return Number(str);
		}
	}
}
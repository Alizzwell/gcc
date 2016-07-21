const express = require('express');
const bodyParser = require('body-parser');

const async = require('async');
const fs = require('fs');
const exec = require('child_process').exec;

const app = express();

app.use(bodyParser.json());
app.use(express.static('public'));

app.post('/test', (req, res) => {
	const userCode = req.body.userCode.trim() + '\n';	// 안해주면 gdb에서 마지막 오류 생김
	const userInput = req.body.userInput;
	const targets = req.body.targets;
	const breaks = req.body.breaks;

	var sourceFile = "temp.cpp";
	var binaryFile = "temp.out";
	var inputFile = "temp.txt";
	var options = "";

	async.waterfall([
		function createUserCodeFile(next) {
			fs.writeFile(sourceFile, userCode, (err) => {
				next(err);
			});
		},
		function createBinaryFile(next) {
			exec(`g++ -g ${sourceFile} -o ${binaryFile}`, (err) => {
				next(err);
			});
		},
		function createUserInputFile(next) {
			if (!userInput) {
				return next();
			}

			options += `-i ${inputFile} `;
			fs.writeFile(inputFile, userInput, (err) => {
				next(err);
			});
		},
		function makeOptions(next) {
			if (targets.length > 0) {
				options += '-t ';
				targets.forEach((target) => {
					options += `${target} `;
				})
			}

			if (breaks.length > 0) {
				options += '-b ';
				breaks.forEach((breakpoint) => {
					options += `${breakpoint} `;
				})
			}
			next();
		},
		function execute(next) {
			exec(`node test.js ${sourceFile} ${binaryFile} ${options}`, 
			(err, stdout, stderr) => {
				next(err, JSON.parse(stdout));
			});
		}
	],
	function finish(err, result) {
		if (err) throw err;
		res.json(result);
		res.end();
	});
});

app.listen(3000);



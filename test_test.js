// node test.js <source-file> <binary-file> <drawAPI-file> <user-input-file>

var fs = require('fs');

const argv = (function parseProcessArgument() {
	var sourcefile = process.argv[2];
	var binaryfile = process.argv[3];
	var drawAPIfile = process.argv[4];
	var inputTxt = process.argv[5];
	var api_box = [];
	var breaks = [];
	
	//api_box = JSON.parse(fs.readFileSync('drawAPI.txt'));		
	api_box = {
		  id: "",
		  title: "",
		  code: "",
		  input: "",
		  date: "",
		  design: {
			structures: {
			  "graph": "graph"
			},
			draws: {
			  "74": {
				"graph": [{
					name: "makeNode",
				    params: {"v": "dest"}
				}]
			  },
			  "86": {
				"graph": [{
				  name: "makeNode",
				  params: {"v": "src"}
				},{
				  name: "highlight",
				  params:  {"v": "src"}
				}]
			  },
			  "126": {
				"graph": [{
					name: "addEdge",
				    params: {"src": "sv", "dst": "ev"}
				}]
			  }
			}				
		  }
	}

				  /*
			  "12": {
				"chart1": [{
				  name: "setData",
				  params: {"index": "now->vertex", "value": 55}
				}]
			  },
			  */
			  /*
			  "25": {
				"chart1": [{
				  name: "swap",
				  params: {"index1": "j", "index2": "j + 1"}
				}, {
				  name: "clearHighlight"
				}, {
				  name: "highlight",
				  params: {"index": "j"}
				}, {
				  name: "highlight",
				  params: {"index": "j + 1"}
				}],
				"graph1": [{
				  name: "makeNode",
				  params: {"id": "v", "lavel": "\"kk\""}
				}]
			  }
			  */
	return {
		"sourcefile" : sourcefile,
		"binaryfile" : binaryfile,
		"drawAPIfile" : drawAPIfile,
		"inputTxt" : inputTxt,
		"api_box" : api_box,
		"breaks" : breaks
	};
}) ();

function gdbStart(argv, pipeline, done) {
	const spawn = require('child_process').spawn;
	const gdb = spawn('gdb', [argv.binaryfile]);
	var output;
	var buf = new String();
	var dataListener = (data) => {
		buf += data;
		if (output = getCompleteStreamData(buf)) {
			gdb.stdout.removeListener('data', dataListener);
			pipeline(gdb, argv, done);
		}
	};

	gdb.stdout.on('data', dataListener);
}


function gdbPipeline(gdb, argv, done) {
	
	var func = gdbConfigurationAndRun(
		gdbProcessing(
			done
		)
	)
	
	func(gdb, argv);
	return ;
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
		
		var api_stack = [];
		var function_name;
		var ex_function_name;
		var now_api;
		var draw_api = {};
		var api_with_value;
		var check;
		var poped = false;
		
		var dataListener = (data) => {
			buf += data;
			if ((output = getCompleteStreamData(buf)) != false) {			
				buf = "";
				if (output.indexOf("exited normally") > -1){
					gdb.stdout.removeListener('data', dataListener);
					gdb.stdin.write('Quit\n');
					return ;
				}
				
				if (mode === 0) {
					mode = 1;
					gdb.stdin.write('info line\n');
					return;
				}

				if (mode == 1) {	
					if (output.indexOf(argv.sourcefile) > -1 && output.indexOf("is out of range") <= -1) {					
						ex_function_name = function_name;
						function_name = getFunctionName(output);
						line = parseLineNumberFromLine(output);
						if(api_stack.length > 0 && function_name == api_stack[api_stack.length-1]["function_name"]){
							gdb.stdout.removeListener('data', dataListener);
							print_drawAPI(api_stack.pop(), gdb, function_name, function(mod_api){
								delete mod_api["function_name"];
								delete mod_api["apis_line"];
								steps.push({"line" : line, "api":  mod_api});
								poped = true;
								gdb.stdout.on('data', dataListener);	
								gdb.stdin.write(`list\n`);
							});
						}
						else { gdb.stdin.write(`list\n`);}
						mode = 2;
						return;
					}
					else {
						mode = 0;
						gdb.stdin.write('finish\n');
					}
					return;
				}
				
				if(mode == 2){
					s_line = String(line);
					if(argv.api_box["design"]["draws"][s_line]){ // 스텝 전 api_stack 에 push	
						now_api = JSON.parse(JSON.stringify(argv.api_box["design"]["draws"][s_line]));
						api_stack.push(api_set(now_api, function_name, line));
					}	
					if(poped == false){ steps.push({ "line": line, "api": null }); }
					else { poped = false;}
					mode = 0;
					gdb.stdin.write('step\n');
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
			if (code != 0) process.exit(1);
			next(gdb, argv, result);
		});

		mode = 1;
		gdb.stdin.write('info line\n');
	}
}


gdbStart(argv, gdbPipeline, function done(gdb, argv, result) {
	var join_api = new String();
	result["steps"].forEach(function(lineInfo) {
		if( lineInfo["api"] != null){
			for(var structure_id in lineInfo["api"]){
				lineInfo["api"][structure_id].forEach(function(api) {
					join_api = api["name"];
					join_api += '(';
					for(var var_name in api["params"]){
						join_api += api["params"][var_name];
						join_api += ',';
					}
					join_api = join_api.slice(0, join_api.length-1);
					join_api += ')';
					//if you want to add like makeNode(1), delete "//"
					//api["join_api"] = join_api;  
					//delete api["name"];
					//delete api["params"];
				})
			}
		} 
	})
	console.log(JSON.stringify(result));
	process.exit(0);
});

/* useful Functions */
function parseLineNumberFromLine(line){
	return Number(line.match(/Line [0-9]+ of/g)[0].split(' ')[1]);
}

function getCompleteStreamData(str) {
	if (str.match(/\n\(gdb\) $/g)) {
		return str.replace(/\n\(gdb\) $/g, '');
	}
	else if(str.match(/\(gdb\) $/g)){
		return str.replace(/\(gdb\) $/g, 'end');
	}
	return false;
}

function getFunctionName(str){
	var ret;
	if(ret = str.match(/\<[^\(]*\(/g)){
		return ret[0].slice(1, ret[0].length-1); 
	}
}

// this function will work as..
//ex) set example
//line : 33, api : {"chart1" : "setData(index1, 55)"} 
//line : 33, api: { "chart1" : "setData(0, 55)" } 
function print_drawAPI(api, gdb, function_name, callback){
	var vn_stack = [];
	var value_names = [];
	var value_indexes = [];
	var set_targets = [];
	
	for(var structure_id in api){
		if(structure_id != "apis_line" && structure_id != "function_name"){
			api[structure_id].forEach(function(name_params) {
				for(var val_name in name_params["params"]){
					value_names.push(name_params["params"][val_name]);
					value_indexes.push(val_name);
					set_targets.push(name_params["params"]);
				}
			});
		}
	}
	var fn = function(str, value){
		set_targets.pop()[value_indexes.pop()] = value;
		if(value_names.length > 0){
			get_value(value_names.pop(), gdb, fn);
		}
		else{
			callback(api);
			return ;
		} 
	};
	if(value_names.length > 0) get_value(value_names.pop(), gdb, fn);
	else callback(api);
}

// this function is async function
function get_value (str, gdb, callback){
	var buf = new String();
	var output;
	var cnt=0;
	var value = "not_set";
	if(typeof(str) === "number") {
		callback(str, Number(str));
		return ;
	}
	
	var dataListener = function(data) {
		buf += data;
		if (output = getCompleteStreamData(buf)){
			value = output.split('=');
			if(value[1] != undefined){
				value = value[1].trim();
			}
			else { // if error
				value = "false";
			}
			gdb.stdout.removeListener('data', dataListener);
			callback(str, value);
		}	
	}

	gdb.stdout.on('data', dataListener);
	gdb.stdin.write(`print ${str}\n`);
	return ;
}


function pr(a){
	console.log(a);
}

// draw_API의 변수들을 읽을 수 있을 때 변수들 Set해주는 함수.
function api_set(api, function_name, line){
	var now_api;
	now_api = api;
	now_api["function_name"] = function_name;
	now_api["apis_line"] = line;
	return now_api;
	
}


module.exports = function(RED) {
    "use strict";
    var exec = require('child_process').exec;
    var spawn = require('child_process').spawn;
    var fs = require('fs');

    var gpioCommand = __dirname+'/nrgpio';
    var allOK = true;

    try {
        var cpuinfo = fs.readFileSync("/proc/cpuinfo").toString();
        if (cpuinfo.indexOf(": BCM") === -1) {
            allOK = false;
            RED.log.warn("rpi-gpio : "+RED._("rpi-gpio.errors.ignorenode"));
        }
        try {
            fs.statSync("/usr/share/doc/python-rpi.gpio"); // test on Raspbian
            // /usr/lib/python2.7/dist-packages/RPi/GPIO
        } catch(err) {
            try {
                fs.statSync("/usr/lib/python2.7/site-packages/RPi/GPIO"); // test on Arch
            } catch(err) {
                try {
                    fs.statSync("/usr/lib/python2.7/dist-packages/RPi/GPIO"); // test on Hypriot
                } catch(err) {
                    RED.log.warn("rpi-gpio : "+RED._("rpi-gpio.errors.libnotfound"));
                    allOK = false;
                }
            }
        }
        if ( !(1 & parseInt((fs.statSync(gpioCommand).mode & parseInt("777", 8)).toString(8)[0]) )) {
            RED.log.warn("rpi-gpio : "+RED._("rpi-gpio.errors.needtobeexecutable",{command:gpioCommand}));
            allOK = false;
        }
    } catch(err) {
        allOK = false;
        RED.log.warn("rpi-gpio : "+RED._("rpi-gpio.errors.ignorenode"));
    }

    // the magic to make python print stuff immediately
    process.env.PYTHONUNBUFFERED = 1;

    var pinsInUse = {};
    var pinTypes = {"out":RED._("rpi-gpio.types.digout"), "tri":RED._("rpi-gpio.types.input"), "up":RED._("rpi-gpio.types.pullup"), "down":RED._("rpi-gpio.types.pulldown"), "pwm":RED._("rpi-gpio.types.pwmout")};

    function GPIOOutNode(n) {
        RED.nodes.createNode(this,n);
        this.pin = n.pin;
        this.set = n.set || false;
        this.level = n.level || 0;
        this.freq = n.freq || 100;
        this.out = n.out || "out";
        var node = this;
        if (!pinsInUse.hasOwnProperty(this.pin)) {
            pinsInUse[this.pin] = this.out;
        }
        else {
            if ((pinsInUse[this.pin] !== this.out)||(pinsInUse[this.pin] === "pwm")) {
                node.warn(RED._("rpi-gpio.errors.alreadyset",{pin:this.pin,type:pinTypes[pinsInUse[this.pin]]}));
            }
        }

        function inputlistener(msg) {
			var flowContext = this.context().flow;
			//console.log(flowContext.get("pin"));
			var pin=flowContext.get("pin");
			console.log(pin)
			if (!pinsInUse.hasOwnProperty(pin)) {
				pinsInUse[pin] = node.out;
			}
			else {
				if ((pinsInUse[pin] !== node.out)||(pinsInUse[pin] === "pwm")) {
					node.warn(RED._("rpi-gpio.errors.alreadyset",{pin:pin,type:pinTypes[pinsInUse[pin]]}));
				}
			}		
			
            if (msg.payload === "true") { msg.payload = true; }
            if (msg.payload === "false") { msg.payload = false; }
            var out = Number(msg.payload);
            var limit = 1;
            if (node.out === "pwm") { limit = 100; }
            if ((out >= 0) && (out <= limit)) {
                if (RED.settings.verbose) { node.log("out: "+out); }
                if (node.child !== null) {
                    node.child.stdin.write(out+"\n");
                    node.status({fill:"green",shape:"dot",text:msg.payload.toString()});
                }
                else {
                    node.error(RED._("rpi-gpio.errors.pythoncommandnotfound"),msg);
                    node.status({fill:"red",shape:"ring",text:"rpi-gpio.status.not-running"});
                }
            }
            else { node.warn(RED._("rpi-gpio.errors.invalidinput")+": "+out); }
        }

        if (allOK === true) {
            if (node.pin !== undefined) {
                if (node.set && (node.out === "out")) {
                    node.child = spawn(gpioCommand, [node.out,pin,node.level]);
                    node.status({fill:"green",shape:"dot",text:node.level});
                } else {
                    node.child = spawn(gpioCommand, [node.out,pin,node.freq]);
                    node.status({fill:"green",shape:"dot",text:"common.status.ok"});
                }
                node.running = true;

                node.on("input", inputlistener);

                node.child.stdout.on('data', function (data) {
                    if (RED.settings.verbose) { node.log("out: "+data+" :"); }
                });

                node.child.stderr.on('data', function (data) {
                    if (RED.settings.verbose) { node.log("err: "+data+" :"); }
                });

                node.child.on('close', function (code) {
                    node.child = null;
                    node.running = false;
                    if (RED.settings.verbose) { node.log(RED._("rpi-gpio.status.closed")); }
                    if (node.done) {
                        node.status({fill:"grey",shape:"ring",text:"rpi-gpio.status.closed"});
                        node.done();
                    }
                    else { node.status({fill:"red",shape:"ring",text:"rpi-gpio.status.stopped"}); }
                });

                node.child.on('error', function (err) {
                    if (err.errno === "ENOENT") { node.error(RED._("rpi-gpio.errors.commandnotfound")); }
                    else if (err.errno === "EACCES") { node.error(RED._("rpi-gpio.errors.commandnotexecutable")); }
                    else { node.error(RED._("rpi-gpio.errors.error")+': ' + err.errno); }
                });

            }
            else {
                node.warn(RED._("rpi-gpio.errors.invalidpin")+": "+pin);
            }
        }
        else {
            node.status({fill:"grey",shape:"dot",text:"node-red:rpi-gpio.status.not-available"});
            node.on("input", function(msg){
                node.status({fill:"grey",shape:"dot",text:RED._("rpi-gpio.status.na",{value:msg.payload.toString()})});
            });
        }

        node.on("close", function(done) {
            node.status({fill:"grey",shape:"ring",text:"rpi-gpio.status.closed"});
            delete pinsInUse[node.pin];
            if (node.child != null) {
                node.done = done;
                node.child.stdin.write("close "+node.pin);
                node.child.kill('SIGKILL');
            }
            else { done(); }
        });

    }
    RED.nodes.registerType("myrpi-gpio out",GPIOOutNode);

    var pitype = { type:"" };
    if (allOK === true) {
        exec(gpioCommand+" info", function(err,stdout,stderr) {
            if (err) {
                RED.log.info(RED._("rpi-gpio.errors.version"));
            }
            else {
                try {
                    var info = JSON.parse( stdout.trim().replace(/\'/g,"\"") );
                    pitype.type = info["TYPE"];
                }
                catch(e) {
                    RED.log.info(RED._("rpi-gpio.errors.sawpitype"),stdout.trim());
                }
            }
        });
    }

    RED.httpAdmin.get('/rpi-gpio/:id', RED.auth.needsPermission('rpi-gpio.read'), function(req,res) {
        res.json(pitype);
    });

    RED.httpAdmin.get('/rpi-pins/:id', RED.auth.needsPermission('rpi-gpio.read'), function(req,res) {
        res.json(pinsInUse);
    });
}

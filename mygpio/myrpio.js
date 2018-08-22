module.exports = function(RED) {
  	
    function MyGpioOutNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
		
        node.on('input', function(msg) {
			var spawn = require('child_process').spawn;

			var gpioCommand = __dirname+'/nrgpio';

			var pin=msg.payload[0];
				console.log("Pin: "+pin);
			var value=msg.payload[1];
				console.log("Value: "+value);
				
			node.child = spawn(gpioCommand, ["out",pin,value]);
			node.child.stdin.write("close "+pin);

        });
    }
    RED.nodes.registerType("mygpio-out",MyGpioOutNode);
}
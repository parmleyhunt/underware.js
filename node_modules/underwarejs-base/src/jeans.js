let {fork} = require('child_process')

module.exports = class {
    constructor(config){
        this.config = config
    }

    // empty callback when a message is recieved by the child pant
    onMessage(message){

    }

    // message from one-to-many
    emit(event, data){
        process.send({
            type: 'emit',
            event: event,
            data: data
        })
    }

    // listen for event
    subscribe(event){
        process.send({
            type: 'bind',
            event: event
        })
    }

    fork(short, config, data, detached){
        let child = fork(__context.underware+'/app.js', [short], {
            cwd: __root,
            detached: (detached)?true:false,
            env: {
                context: JSON.stringify(__context),
                config: JSON.stringify(config), 
                data: JSON.stringify(data)
            }
        })
        child.on('spawn', ()=>{
            console.log('%s forked', short)
        })
        return child
    }
}

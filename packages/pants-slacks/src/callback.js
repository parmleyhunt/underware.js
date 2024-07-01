let path = require('path')
module.exports = class extends $('underwarejs-base/shorts'){
    constructor(config, data){
        super(config, data)
        
        global.req = data
        global.res = this
        global.__dmz = path.join(__root, 'pants', req.domain, req.sub)
        
    }
    
    cork(){
        process.send({
            action: 'cork'
        })
    }
    uncork(){
        process.send({
            action: 'uncork'
        })
    }

    setHeader(name, value){
        process.send({
            action: 'setHeader',
            args: arguments
        })
    }

    writeHead(statusCode, statusMessage, headers){
        process.send({
            action: 'writeHead',
            args: arguments
        })
    }

    write(chunk, encoding){
        process.send({
            action: 'write',
            args: arguments
        })
    }

    end(body, encoding){
        process.send({
            action: 'end',
            args: arguments
        })
    }
}
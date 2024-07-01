let http = require('http'),
    https = require('https')

module.exports = class extends $('underwarejs-base/jeans') {
    constructor(config){
        super(config)

        this.startServers()
    }
    
    startServers(){
        let self = this
        http.createServer((req, res)=>{
            // build request object to pass to router
            let data = {}
            data.headers = req.headers
            data.method = req.method
            data.url = req.url
            data.headers.host = data.headers.host.replace(/\:.+/, "")

            // get router short and ensure only 1
            let router = self.fork("underwarejs-slacks/routing", this.config, data, true)

            // send data and end events to router
            req.on('data', (chunk)=>{
                router.send({
                    type: 'chunk',
                    body: chunk
                })
            })
            req.on('end', ()=>{
                router.send({
                    type: 'end'
                })
            })

            // listen for res functions
            router.on('message', (mssg, handle)=>{
                mssg.args = Object.values(mssg.args)
                for(let i = 0; i < mssg.args.length;i++){
                    if(mssg.args[i].type === 'Buffer'){
                        mssg.args[i] = Buffer.from(mssg.args[i])
                    }
                }
                res[mssg.action].apply(res, mssg.args)
                if(mssg.action == "end"){
                    router.send({
                        type: 'complete'
                    })
                }
            }).on('exit', (code)=>{
                if(!res.writableEnded) res.end()
            })
        }).listen(this.config.port)
    }
}

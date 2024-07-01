let fs = require('fs'),
    url = require('url'),
    path = require('path')
    mimetypes = require(__dirname+'/mimetypes.json')

module.exports = class extends $('underwarejs-base/shorts') {
    constructor(config, data){
        super(config, data)
    }

    handle(req){
        let [_, sub, domain] = (/^(.+)\.(.+\..+)$/.exec(req.headers.host) || ['', 'www', req.headers.host])
        let parseURL = new URL('https://'+req.headers.host+req.url);
        let uri = parseURL.pathname;
        this.data.paras = {};
        for(let [k,v] of parseURL.searchParams.entries()){
            this.data.paras[k] = v;
        }

        // save parts to request important for later
        this.data.sub = sub
        this.data.domain = domain

        // ensure all requests are pointing to a valid subdomain
        if(sub == 'src') sub = 'www';

        // ensure all requests with a trailing '/' are pointed to index
        if(/\/$/.test(uri)) uri += "index.html"

        // log each incomming request
        console.log(req.method, req.headers.host, uri)

        // if cookies parse them
        if(req.headers.cookie) this.parseCookies(req.headers.cookie)
        
        // check for route
        let route = this.findRoute(sub, req.method, uri)
        if(route){

            // parse any parameters that the route may have
            if(route.route.includes(':')) this.parseParameters(route, uri)

            // parse a possible redirect
            if(route.handler.includes(',')) uri = this.parseRedirect(route, uri)

            // parse short callbacks
            if(route.handler.includes('@')) uri = this.parseShorts(route, uri)

            // assume at the very least route is an alias
            uri = this.parseAlias(route, uri)
        }

        if(uri && fs.existsSync(path.join(__context.root, 'pants', domain, sub, uri))){
            this.serve(domain, sub, uri)
        }else if(this.data.short){
            let short = this.fork(domain+'/'+this.data.short, this.config, this.data)
            let self = this
            // listen for res functions
            short.on('message', (mssg, handle)=>{
                mssg.args = Object.values(mssg.args)
                self[mssg.action].apply(self, mssg.args)
            })
        }else if(this.data.redirect){
            this.writeHead(parseInt(this.data.redirect.code), {'Location': this.data.redirect.address})
            this.end()

        }else{
            this.showError(404, 'Not Found')

        }

    }

    serve(domain, sub, uri){
        let filename = path.join(__context.root, 'pants', domain, sub, uri)

        fs.open(filename, (err, fd)=>{ 
            if(err){ 
                console.log(err) 
                switch(err.code){ 
                    case "ECONNREFUSED": 
                        this.showError(400, "Connection Refused") 
                        break; 
                    case "ENOENT": 
                        this.showError(404, "Not Found") 
                        break; 
                    case "ETIMEDOUT": 
                        this.showError(504, "Timed Out") 
                        break; 
                    case "EISDIR": 
                        this.showError(400, "Bad Request") 
                        break; 
                    default: 
                        throw err; 
                } 
                return; 
            } 
            fs.fstat(fd, (err, stats)=>{ 
                if(err){ 
                    switch(err.code){ 
                        case "EACCES": 
                        case "EPERM": 
                            this.showError(401, "Unauthorized") 
                    } 
                } 
                if(stats.isDirectory()){ 
                    this.showError(400, "Bad Request") 
                }

                // handle mimetype
                let mimetype = mimetypes[path.extname(filename).split(".")[1]]; 
                if(mimetype === undefined) console.log("UNK: " + filename); 
                this.setHeader('Content-Type', mimetype+'; charset=UTF-8')
                this.setHeader('Transfer-Encoding', 'chunked')
  
                if(mimetype == "text/html"){
                    // buffer file
                    let bufferSize = stats.size, 
                        chunkSize = 1024, 
                        buffer = Buffer.allocUnsafe(bufferSize), 
                        bytesRead = 0 
                    while(bytesRead < bufferSize){ 
                        if((chunkSize + bytesRead) > bufferSize) chunkSize = bufferSize - bytesRead 
                        fs.readSync(fd, buffer, bytesRead, chunkSize, bytesRead) 
                        bytesRead += chunkSize 
                    } 
                    fs.closeSync(fd)

                    // check for templating
                    if((buffer.includes('<?') && buffer.includes('?>')) || buffer.includes('<include')){
                        // TODO: fix templating not getting killed
                        this.render = this.fork("underwarejs-slacks/template", this.config, {request: this.data, contents: buffer})

                        this.render.on('message', (mssg, handle)=>{
                            mssg.args = Object.values(mssg.args)
                            this[mssg.action].apply(this, mssg.args)
                        })

                        process.on('beforeExit', (code)=>{
                            //if(this.render) this.render.disconnect()
                        })
                    }else{
                        this.end(buffer)
                    }
                }else{
                    let fstream = fs.createReadStream(filename)
                        fstream.on("error", (e)=>{
                            console.error(e)
                            this.end("error")
                        })
                        fstream.on("data", (data)=>{
                            this.write(data)
                        })
                        fstream.on("close", ()=>{
                            this.end()
                        })
                }
            }) 
        })
    }

    // listening for request body event
    onMessage(message){
        if(message.type == "chunk"){
            if(!this.data.body) this.data.body = ""
            this.data.body += Buffer.from(message.body).toString() || ""
        }else if(message.type == "end"){
            this.data.body = require('querystring').decode(this.data.body)
            this.handle(this.data)
        }else if(message.type == "complete"){
            process.exit(0)

        }
    }


    findRoute(sub, method, uri){
        let routes = (((this.config['routes'] || [])[sub] || [])[method] || [])
        for(let [route, handler] of Object.entries(routes)){
            if(route.includes(':')){
                let pat = route.replace(/:([-0-9a-zA-Z]+)/g, "([-_0-9a-zA-Z\\!\\%\\.]+)")

                if(new RegExp("^"+pat+"$").test(uri)){
                    return {
                        route: route,
                        handler: handler
                    }
                }
            }else if(route == uri){
                return {
                    route: route,
                    handler: handler
                }

            }
        }
        return undefined
    }

    parseCookies(cookie){
        this.data.cookies = {}
        let s = cookie.split(';')
        for(let part of s){
            part = part.trim()
            if(!/^(?:Domain=|Expires=|HttpOnly|Max-Age=|Partitioned|Path=|Secure|SameSite=)/.test(part)){
                let [name, value] = part.split('=')
                this.data.cookies[name] = value
            }
        }
    }

    // :para, $para -> req.paras
    parseParameters(route, uri){
        // replace named parameters with catch groups
        let pat = route.route.replace(/:([-0-9a-zA-Z]+)/g, ":?([-_0-9a-zA-Z\\!\\%\\.]+)")

        // get the parameter names
        let r = new RegExp("^"+pat+"$").exec(route.route)

        // get the parameter values
        let u = new RegExp("^"+pat+"$").exec(uri)

        // make sure names and values are both present
        if(r && u){
            for(let i = 1; i < r.length;i++){
                this.data.paras[r[i]] = u[i]
            }
        }
    }

    // url, code
    parseRedirect(route, uri){
        let [address, code] = route.handler.split(/, ?/)

        // replace any present parameters
        if(address.includes('$')){
            for(let [k, v] of Object.entries(this.data.paras)){
                address = address.replace('$'+k, v)
            }
        }

        // set redirect object in request
        this.data.redirect = {
            address: address,
            code: code
        }

        // keep from serving static
        return undefined
    }

    // @handler
    parseShorts(route, uri){
        console.log('short', route, uri)
        // set short value in request
        this.data.short = route.handler.substring(1)

        // keep from serving static
        return undefined
    }

    // change uri to handler
    parseAlias(route, uri){
        // if uri is already being handled ignore
        if(!uri) return uri

        // replace any present parameters
        if(route.handler.includes('$')){
            let ret = route.handler
            for(let [k, v] of Object.entries(this.data.paras)){
                ret = ret.replace('$'+k, v)
            }
            return ret
        }else return route.handler
    }

    showError(code, message){
        this.writeHead(code, message)
        this.end(message)
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

#!/usr/bin/env node

module.exports = (root)=>{

    let path = require('path'),
        https = require('https'),
        http = require('http'),
        tls = require('tls'),
        fs = require('fs'),
        url = require('url'),
        os = require('os'),
        {fork, execSync} = require('child_process')
    const { exit } = require('process')

    const closet = walk(root)
    const connections = pullSockets(closet)
    const secure = Object.keys(connections).length && fs.existsSync(root+'/pants/'+Object.keys(connections)[0]+'/fullchain.pem')
    console.log(secure, Object.keys(connections).length, Object.keys(connections)[0], fs.existsSync('/etc/letsencrypt/live/'+Object.keys(connections)[0]+'/fullchain.pem'))
    const linux = os.platform() == 'linux'
    const [bin, file, ...flags] = process.argv

    let httpPort = 80
    let httpsPort = 443
    let uid = 4000
    if(flags.includes('-http')) httpPort = flags[flags.indexOf('-http')+1]
    if(flags.includes('-https')) httpsPort = flags[flags.indexOf('-https')+1]
    if(flags.includes('-u')) uid = flags[flags.indexOf('-u')+1]
    if(flags.includes('-h')){
        console.log('underware[ -http <port>][ -https <port>][ -u <uid>]\n\t-http - the port the http server will listen on\n\t-https - the port the https server will listen on\n\t-u - the uid of the \'underware\' user to run services as')
        return
    }

    console.log(httpPort, httpsPort);


    if(Object.values(connections).length){
        try{
            if(secure){
                https.createServer({
                    cert: fs.readFileSync(root+'/pants/'+Object.keys(connections)[0]+'/fullchain.pem'),
                    key: fs.readFileSync(root+'/pants/'+Object.keys(connections)[0]+'/privkey.pem'),
                    SNICallback: (hostname, cb) => {
                        let [_, sub, domain] = (/^(.+)\.(.+\..+)$/.exec(hostname) || ['', 'www', hostname])
                        cb(null, tls.createSecureContext({
                            cert: fs.readFileSync(root+'/pants/' + domain + '/fullchain.pem'),
                            key: fs.readFileSync(root+'/pants/' + domain + '/privkey.pem')
                        }))
                    }
                }, (req, res) => {
                    let uri = url.parse(req.url).pathname;
                    pipe(req, res)
                }).listen(httpsPort)
            }

            http.createServer((req, res) => {
                let [_, sub, domain] = (/^(.+)\.(.+\..+)$/.exec(req.headers.host) || ['', 'www', req.headers.host])
                let uri = url.parse(req.url).pathname;

                if(((connections[domain] || {}).insecure || []).some((route)=>{
                    route = route.replace('\/', '\\\/')
                    route = route.replace('\\', '\\\\')
                    if(route.contains('*')) route = route.replace('*', '\\.*')
                    if(route.contains(':')) route = route.replace(/:[-_A-Za-z0-9\.]/, '[-_A-Za-z0-9\\.]')
                    if(new RegExp(route).test(uri)) return true
                    else return false
                }) || !secure){
                    pipe(req, res)
                }else{
                    res.writeHead(303, {'Location': 'https://' + req.headers.host + req.url})
                    res.end()
                }
            }).listen(httpPort)
        }catch(e){
            throw e;
        }
    }

    if(linux){
        try{execSync('id underware')}catch(e){
            console.log('Deescalation Failed: user underware doesn\'t exist. Attempting to run as user.')
            uid = process.getuid()
            if(uid == 0){
                console.error('Refusing to run as root. Fix configuration.')
                exit(1)
            }
        }
        fork(__dirname+'/index.js', {cwd: root, env: {closet: JSON.stringify(closet)}, uid: uid})
    }else{
        fork(__dirname+'/index.js', {cwd: root, env: {closet: JSON.stringify(closet)}})
    }

    // forward traffic to a lesser privilege handler
    function pipe(req, res){
        let [_, sub, domain] = (/^(.+)\.(.+\..+)$/.exec(req.headers.host) || ['', 'www', req.headers.host])
        
        if(!domain){
            res.end('not found')
            return
        }

        domain = domain.replace(/\:\d+/, '')
        req.headers.ip = req.socket.remoteAddress
        req.headers.iport = req.socket.remotePort


        //proxy to server
        var options = {
            hostname: '127.0.0.1',
            port: (connections[domain] || {}).port,
            path: req.url,
            method: req.method,
            headers: req.headers
        }
        if(options.port){
            let proxy = http.request(options, (proxy_res)=>{
                res.writeHead(proxy_res.statusCode, proxy_res.headers)
                proxy_res.pipe(res, {
                    end: true
                })
            }).on('error', function(e){
                console.log(e);
                res.end('error')
            })

            req.pipe(proxy, {
                end: true
            })
        }else{
            res.end('not found')
        }
    }

    // build a tree of pants
    function walk(dir){
        let entries = []
        let [_, parent] = /[\\\/]+([-_A-Za-z0-9\.]+)[\\/]?$/.exec(dir) || [undefined, 'invalid']

        if(fs.existsSync(path.join(dir, 'node_modules'))){
            for(let pkg of fs.readdirSync(path.join(dir, 'node_modules'), {withFileTypes: true})){
                if(fs.existsSync(path.join(dir, 'node_modules', pkg.name, 'zipper.json'))){
                    entries.push({
                        id: parent + '/' + pkg.name,
                        name: pkg.name,
                        path: path.join(dir, 'node_modules', pkg.name),
                        zipper: JSON.parse(fs.readFileSync(path.join(dir, 'node_modules', pkg.name, 'zipper.json')))
                    })
                }
                // check if symlink
                if(pkg.isSymbolicLink()){
                    let p = path.join(dir, 'node_modules')
                    let t = fs.readlinkSync(path.join(p, pkg.name))
                    let dest = (t.includes(':'))?t:path.join(p, t)
                    entries.push(...walk(dest))
                }else{
                    entries.push(...walk(path.join(dir, 'node_modules', pkg.name)))
                }
            }
        }
        if(fs.existsSync(path.join(dir, 'pants'))){
            for(let pkg of fs.readdirSync(path.join(dir, 'pants'))){
                if(fs.existsSync(path.join(dir, 'pants', pkg, 'zipper.json'))){
                    entries.push({
                        id: parent + '/' + pkg,
                        name: pkg,
                        path: path.join(dir, 'pants', pkg),
                        zipper: JSON.parse(fs.readFileSync(path.join(dir, 'pants', pkg, 'zipper.json')))
                    })
                }
            }
        }
        return entries
    }

    // get socket ports from zippers
    function pullSockets(closet){
        let connections = {}
        for(let pkg of closet){
            for(let [k, v] of Object.entries(pkg.zipper.config || {})){
                let connection = {}
                for(let [sk, sv] of Object.entries(v)){
                    if(sk == "port") connection.port = sv
                    if(sk == "allowInsecure") connection.insecure = sv
                }
                if(connection.port){
                    connections[pkg.name] = connection
                }
            }
        }
        return connections
    }
}
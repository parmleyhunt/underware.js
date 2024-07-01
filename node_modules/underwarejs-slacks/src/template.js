let fs = require('fs'),
    path = require('path')

module.exports = class extends $('underwarejs-base/shorts') {
    constructor(config, data){
        super(config, data)

        this.patterns = [
            /<\? ?(.*?) ?\?>/,
            /(.*?) ?\?>/,
            /<\? ?(.*)/
        ]
        this.incpat = /<include (.*?)>/
        this.delimeter = "[---]";
        let req = data.request;
        let res = this;
        global.__dmz = path.join(__root, 'pants', req.domain, req.sub)
        
        let page = this.convert(Buffer.from(data.contents).toString())
        page = this.unescape(page)
        eval("(async ()=>{"+page+"function write(data){res.write((data || '')+'');}res.end()})()")
    }

    convert(contents){
        let lines = contents.split(/\r?\n/)
        let open = false
        let doc = ""

        for(let line of lines){
            let node = []
            let html = ""
            line = line.trim()
            let change = false
            let found = false

            // run through the patterns
            for(let [i, pattern] of Object.entries(this.patterns)){
                // check if pattern valid
                if(pattern.test(line)){
                    let match
                    while(match = pattern.exec(line)){
                        // keep serverside
                        node.push(match[1])

                        // keep note of serverside locations
                        line = line.replace(match[0], this.delimeter)
                        found = true
                    }

                    // if open or close set change flag
                    if(i == 2 || i == 1) change = !change
                }
            }

            // don't accidently put an inverse in node
            if(open && !found){
                node.push(line)
                html = this.delimeter
            }else if(!found && this.incpat.test(line)){
                let uri = line.replace(this.incpat, "$1")
                doc = this.append(doc, this.include(uri))
            }else{
                html = line + ((change)?'':"\\n")
            }

            // switch open/close state after full line
            if(change) open = !open

            // split line by delimeter
            let sections = html.split(this.delimeter)
            for(let i = 0;i < sections.length;i++){
                doc = this.append(doc, this.escape(sections[i]))
                if(i != sections.length-1) doc = this.append(doc, node[i])
            }

        }
        return doc
    }

    include(uri){
        uri = path.join(__dmz, uri)
        if(fs.existsSync(uri)){
            return this.convert(fs.readFileSync(uri).toString())
        }else{
            return ""
        }
    }

    // consistency helper
    append(doc, data){
        if(data == "") return doc;
        return doc + data + "\r\n";
    }

    // consistency helper
    escape(html){
        if(html == "") return '';
        let out = ('' + html).replace(/&/g,'&&amp;').replace(/</g,'&&lt;').replace(/>/g,'&&gt;').replace(/"/g,'&&quot;').replace(/\\'/g,'&&#dbs;').replace(/'/g,'&&#x27;').replace(/\//g,'&&#x2F;');
        return "write('"+out+"');";
    }

    // consistency helper
    unescape(text){
        return ('' + text).replace(/&&amp;/g,'&').replace(/&&lt;/g,'<').replace(/&&gt;/g,'>').replace(/&&quot;/g,'"').replace(/&&#x27;/g,"\\\'").replace(/&&#dbs;/g, "\\\\\\\'").replace(/&&#x2F;/g,'/');
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

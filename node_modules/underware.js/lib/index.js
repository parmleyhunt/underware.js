let fs = require('fs'),
    path = require('path'),
    cp = require('child_process')

// context reference back to orchestrator
global.__context = {
    exports: {},
    depends: {},
    paths: {}
}

let names = {}
let running = {}
let init = []
let configs = {}
let pjs = {}
let events = {}

global.__root = process.cwd()
global.__mods = __root+'/node_modules/'
global.__pants = __root+'/pants/'
__context.underware = __dirname
__context.root = __root
const closet = JSON.parse(process.env.closet)

// grab zippers
for(let pkg of closet){
    parseZipper(pkg)
}

// handle defered start
for(let i of init){
    initService(i)
}

let alreadyAdded =[]
fs.watch(__pants, (etype, fname) => {
    if(!alreadyAdded.includes(fname)){
        alreadyAdded.push(fname)
        grabZipper(__pants + fname, true)
    }
})
fs.watch(__mods, (etype, fname) => {
    if(!alreadyAdded.includes(fname)){
        alreadyAdded.push(fname)
        grabZipper(__mods + fname, true)
    }
})

// clock for pjs
setInterval(()=>{
    let date = new Date()
    let minute = date.getMinutes()
    let hour = date.getHours()
    let day = date.getDate()
    let month = date.getMonth()
    let dow = date.getDay()
    for(let [event, handlers] of Object.entries(pjs)){
        if(event.includes(' ')){
            for(let handler of handlers){
                let str = minute+" "+hour+" "+day+" "+month+" "+dow
                let ev = new RegExp(event.replace('*','[0-9]+'))
                if(ev.test(str)){
                    let [pkg, exp] = handler.split('/')
                    spawn(event, configs[pkg])
                }
            }
        }
    }
}, 60000)

// utility to keep clean between fresh and modified
function grabZipper(uri){
    let [_, parent, pkg] = /([-_A-Za-z0-9\.]+)[\\\/](?:node_modules|pants)[\\\/]([-_A-Za-z0-9\.]+)[\\\/]?[-_A-Za-z0-9\.]*$/.exec(uri) || [undefined, undefined, undefined]
    if(!pkg){
        console.log(uri, pkg)
        return
    }

    try{
        let furi = uri
        if(!/zipper\.json$/.test(uri)) furi = path.join(uri, 'zipper.json')
        let zipper = JSON.parse(fs.readFileSync(furi))
        let info = {
            id: parent+"/"+pkg,
            path: uri,
            name: pkg,
            zipper: zipper
        }
        parseZipper(info, true)
    }catch(e){
        console.error(e)
    }
}

function parseZipper(mod, added){

    let zipper = mod.zipper
    let pkg = mod.name
    __context.paths[pkg] = path.join(mod.path, '')
    // save exports
    for(let [k, v] of Object.entries(zipper.exports || {})){
        console.log('Export Added:', hashPkg(pkg, k))
        __context.exports[hashPkg(pkg, k)] = path.join(mod.path, v)

        fs.watchFile(path.join(mod.path, v), (curr, prev)=>{
            walk(hashPkg(pkg, k), hashPkg(pkg, k))
        })
    }

    // keep track of depends
    for(let [k,v] of Object.entries(zipper.depends || {})){
        if(!/\//.test(v)) v = hashPkg(pkg, v)
        __context.depends[v] = __context.depends[v] || []
        __context.depends[v].push(hashPkg(pkg, k))
        console.log('Depend Added: %s -> %s', hashPkg(pkg, k), v)
    }

    // register events
    for(let [event, handler] of Object.entries(zipper.pjs || {})){
        if(!/\//.test(handler)) handler = hashPkg(pkg, handler)
        pjs[event] = pjs[event] || []
        pjs[event].push(handler)
        console.log('Event Handler Added: %s -> %s', event, handler)
    }

    configs[pkg] = zipper.config || {}

    // handle init
    for(let i of (zipper.init || [])){
        if(added){
            // start now if needed
            initService(pkg+'/'+i)
        }else{
            // check for init
            init.push(pkg+'/'+i)
        }
    }

    // watch for modifications to zipper file
    fs.watchFile(path.join(mod.path, 'zipper.json'), {persistent:false}, (curr, prev)=>{
        console.log('Zipper Changed:', pkg)
        closeZipper(mod, zipper)
        grabZipper(mod.path)
    })
}

// cleanup modified zipper
function closeZipper(mod, zipper){
    let pkg = mod.name
    // delete exports
    for(let k in (zipper.exports || {})){
        console.log('Export Removed:', hashPkg(pkg, k))
        delete __context.exports[k]
    }

    // delete depends
    for(let [k,v] of Object.entries(zipper.depends || {})){
        if(!/\//.test(v)) v = hashPkg(pkg, v)
        for(let i = 0; i < __context.depends[v].length;i++){
            if(__context.depends[v][i] == hashPkg(pkg, k)){
                __context.depends[v].splice(i, 1)
            }
        }
        console.log('Depend Removed: %s -/> %s', hashPkg(pkg, k), v)
    }

    // stop init
    for(let i of (zipper.init || [])){
        killService(pkg+'/'+i)
    }

    // unregister event handlers
    for(let [event, handler] of Object.entries(zipper.pjs || {})){
        if(!/\//.test(handler)) handler = hashPkg(pkg, handler)
        for(let i = 0; i < pjs[event].length;i++){
            if(pjs[event][i] == handler){
                pjs[event].splice(i, 1)
            }
        }
        console.log('Event Handler Removed: %s -/> %s', event, handler)
    }

    delete configs[pkg]
}

// hash utility for namespace
function hashPkg(pkg, file){
    return pkg+'/'+file
}

// 7-24 moved events to jeans for cleaner comm
function initService(name){
    let [pkg, exp] = name.split('/')
    let child = fork(__dirname+'/app.js', name, __context, configs[pkg][exp] || {}, {})
    child.on('spawn', ()=>{
        console.log('%s started successfully', name)
    }).on('error', (err)=>{
        console.error('%s error: %s', name, err)
    }).on('message', (mssg, handle)=>{
        handleMessage(name, mssg)
    })
    running[name] = child
}

function killService(name){
    running[name].kill()
}

function handleMessage(name, message){
    switch(message.type){
        case 'bind':
            if(!events[message.event]) events[message.event] = []
            events[message.event].push(name)
            break
        case 'emit':
            if(events[message.event]){
                for(let sub of events[message.event]){
                    running[sub].send(message)
                }
            }else{
                running[name].send({
                    type: 'error',
                    data: 'no response'
                })
            }
            break
    }
}

// walk through the dependency to refresh modified exports
// 8-19-22 needs to be updated to new method of loading
function walk(exp, modified){
    let affected = []
    /*for(let dependent of (__context.depends[exp] || [])){
        let [pkg, pant] = dependent.split('/')
        let zipper = require(__pants+pkg+`/zipper.json`)
        if((zipper.init || []).includes(pant)){
            //stop and add to list
            console.log('Killed:', dependent)
            killService(dependent)
            affected.push(dependent)
        }
        let pass = walk(dependent)
        affected.push(...pass)
    }*/
    if(exp == modified){
        for(let r of affected){
            console.log('Init:',r)
            initService(r)
        }
    }else{
        return affected
    }
}

// forks a short without a parent pant (ie: pjs)
function spawn(event, config){
    let events = pjs[event] || []
    let handles = []
    for(let name of events){
        let child = fork('lib/app.js', name, __context, config || {})
        child.on('spawn', ()=>{
            console.log('%s started successfully', name)
        })
        handles.push(child)
    }
    return handles
}

function fork(module, name, context, config, data){
    return cp.fork(module, [name], {
        cwd: __root, 
        env: {
            context: JSON.stringify(context),
            config: JSON.stringify(config),
            data: JSON.stringify(data)
        }
    })
}

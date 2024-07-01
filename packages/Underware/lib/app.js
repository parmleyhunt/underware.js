let {argv} = require('process')
// argv = [_, _, context, pkg/export, config, data]

global.__context = JSON.parse(process.env.context)

// helper function to make extending cleaner
global.$ = (name)=>{
    let exp = require(__context.exports[name])
    return exp
}

// get reference to class
let cls = $(argv[2])
let [pkg, exp] = argv[2].split('/')
global.__pkg = __context.paths[pkg]
global.__root = __context.root

// parse config
let config = JSON.parse(process.env.config)

// parse data
let data = JSON.parse(process.env.data || {})

// contruct class with config and data (if applicable)
let app = new cls(config, data)

// inter-pants communication pass-through
process.on('message', (message)=>{
    app.onMessage(message)
})

process.on('exit', ()=>{
    console.log(argv[2], 'died')
})

process.on('disconnect', ()=>{
  console.log(argv[2], 'disconnected')
})

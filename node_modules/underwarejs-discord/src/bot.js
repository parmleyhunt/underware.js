const { ChannelType, ...discord } = require('discord.js')
//let discord = require('discord.js')
let events = require(__dirname + '/events.json')

module.exports = class extends $('underwarejs-base/jeans') {
    constructor(config){
        super(config)

        let intents = []
        for(let intent of (config.intents || ["Guilds"])){
            intents.push(discord.GatewayIntentBits[intent])
        }
        let partials = []
        for(let partial of (config.partials || [])){
            partials.push(discord.Partials[partial])
        }

        this.client = new discord.Client({intents: intents, partials: partials})

        try{
            this.client.login(config.token)
        }catch(e){
            throw e
        }

        this.client.once('ready', ()=>{
            this.onReady()
        })

        // proxy event handlers
        for(let [k, v] of Object.entries(events)){
            let fname = "on" + k.charAt(0).toUpperCase() + k.substring(1)
            this.client.on(k, (...args) => {
                this[fname].apply(this, args)
            })
        }
    }

    onReady(){
        // proxy properties
        this.application = this.client.application
        this.channels = this.client.channels
        this.emojis = this.client.emojis
        this.guilds = this.client.guilds
        this.options = this.client.options
        this.readyAt = this.client.readyAt
        this.readyTimestamp = this.client.readyTimestamp
        this.rest = this.client.rest
        this.sweepers = this.client.sweepers
        this.uptime = this.client.uptime
        this.user = this.client.user
        this.users = this.client.users
        this.voice = this.client.voice
        this.ws = this.client.ws

        // preload caches
        this.guilds.cache
        .each((guild) => {
            guild.members.fetch()
            guild.roles.fetch()
            guild.emojis.fetch()
            guild.channels.fetch()
            guild.stickers.fetch()
        })

        console.log(this.user.username, "has logged in.")
    }

    destroy(){
        this.client.destroy()
    }

    fetchGuildPreview(guild){
        return this.client.fetchGuildPreview(guild)
    }

    fetchGuildTemplate(template){
        return this.client.fetchGuildTemplate(template)
    }

    fetchGuildWidget(guild){
        return this.client.fetchGuildWidget(guild)
    }

    fetchInvite(invite, options){
        return this.client.fetchInvite(invite, options)
    }

    fetchPremiumStickerPacks(){
        return this.client.fetchPremiumStickerPacks()
    }

    fetchSticker(id){
        return this.client.fetchSticker(id)
    }

    fetchVoiceRegions(){
        return this.client.fetchVoiceRegions()
    }

    fetchWebhook(id, token){
        return this.client.fetchWebhook(id, token)
    }

    generateInvite(options){
        return this.client.generateInvite(options)
    }

    isReady(){
        return this.client.isReady()
    }

    defaultPersonalChannel(state){
        for(let personalChannel of this.config.personalChannels || []){
            if(personalChannel.channel === state.channelId){
                let name = this.replaceLobbyName(state, personalChannel.name)
                state.guild.channels.create({
                    name: name,
                    userLimit: personalChannel.max,
                    type: ChannelType.GuildVoice,
                    parent: personalChannel.parent
                }).then((channel)=>{
                    state.setChannel(channel.id)
                }).catch(console.error)
            }
        }
    }

    defaultDestroyPersonalChannel(old){
        for(let personalChannel of this.config.personalChannels || []){
            let parent = old.guild.channels.cache.get(personalChannel.parent)
            if(!parent || !parent.children) return
            parent.children.cache.filter(child => child.id !== personalChannel.channel)
            .each((child) => {
                if(child.members.size == 0){
                    old.guild.channels.delete(child.id)
                    .catch(e => console.error)
                }
            })
        }
    }

    defaultSwitchPersonalChannel(old, state){
        this.defaultDestroyPersonalChannel(old)
        this.defaultPersonalChannel(state)
    }

    // watch for personal channels
    onVoiceStateUpdate(old, state){
        let diff = this.stateDifference(old, state)
        if(diff.includes('channelId')){
            if(state.channelId && !old.channelId){
                // fresh join
                this.onVoiceStateJoin(state)
                .catch(()=>{
                    // default personal channel
                    this.defaultPersonalChannel(state)
                })
            }else if(old.channelId && !state.channelId){
                // dead leave
                this.onVoiceStateLeave(old)
                .catch(()=>{
                    this.defaultDestroyPersonalChannel(old)
                })
            }else{
                // switch channels
                this.onVoiceStateSwitch(old, state)
                .catch(()=>{
                    this.defaultSwitchPersonalChannel(old, state)
                })
            }
        }
    }

    stateDifference(old, state){
        let diff = []
        Object.keys(old).forEach(key => {
            if(old[key] !== state[key]){
                diff.push(key)
            }
        })
        return diff
    }
    
    // way to customize the pool logic
    async onVoiceStateJoin(state){
        return Promise.reject(false)
    }

    async onVoiceStateLeave(old, state){
        return Promise.reject(false)
    }

    async onVoiceStateSwitch(old, state){
        return Promise.reject(false)
    }

    replaceLobbyName(state, str){
      return str.replace('$user', state.guild.members.cache.get(state.id).displayName)
    }

    // events
    onApplicationCommandPermissionsUpdate(data){}
    onChannelCreate(channel){}
    onChannelDelete(channel){}
    onChannelPinsUpdate(channel, time){}
    onChannelUpdate(old, channel){}
    onDebug(info){}
    onEmojiCreate(emoji){}
    onEmojiDelete(emoji){}
    onEmojiUpdate(old, emoji){}
    onError(error){}
    onGuildBanAdd(ban){}
    onGuildBanRemove(ban){}
    onGuildCreate(guild){}
    onGuildDelete(guild){}
    onGuildIntegrationsUpdate(guild){}
    onGuildMemberAdd(member){}
    onGuildMemberAvailable(member){}
    onGuildMemberRemove(member){}
    onGuildMembersChunk(members, guild, chunk){}
    onGuildMemberUpdate(old, member){}
    onGuildScheduledEventCreate(event){}
    onGuildScheduledEventDelete(event){}
    onGuildScheduledEventUpdate(old, event){}
    onGuildScheduledEventUserAdd(event, user){}
    onGuildScheduledEventUserRemove(event, user){}
    onGuildUnavailable(guild){}
    onGuildUpdate(old, guild){}
    onInteractionCreate(interaction){}
    onInvalidated(){}
    onInviteCreate(invite){}
    onInviteDelete(invite){}
    onMessageCreate(message){}
    onMessageDelete(message){}
    onMessageDeleteBulk(messages, channel){}
    onMessageReactionAdd(reaction, user){}
    onMessageReactionRemove(reaction, user){}
    onMessageReactionRemoveAll(message, reactions){}
    onMessageReactionRemoveEmoji(reaction){}
    onMessageUpdate(old, message){}
    onPresenceUpdate(old, presence){}
    onRoleCreate(role){}
    onRoleDelete(role){}
    onRoleUpdate(old, role){}
    onShardDisconnect(event, id){}
    onShardError(error, id){}
    onShardReady(id, unavailable){}
    onShardReconnecting(id){}
    onShardResume(id, events){}
    onStageInstanceCreate(instance){}
    onStageInstanceDelete(instance){}
    onStageInstanceUpdate(old, instance){}
    onStickerCreate(sticker){}
    onStickerDelete(sticker){}
    onStickerUpdate(old, sticker){}
    onThreadCreate(thread, created){}
    onThreadDelete(thread){}
    onThreadListSync(threads, guild){}
    onThreadMembersUpdate(added, removed, thread){}
    onThreadMemberUpdate(old, member){}
    onThreadUpdate(old, thread){}
    onTypingStart(typing){}
    onUserUpdate(old, user){}
    onWarn(info){}
    onWebhookUpdate(channel){}
}

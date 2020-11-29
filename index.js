const { VK } = require('vk-io');
const vk = new VK({ token: process.env.TOKEN });
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('db.json');
const db = low(adapter);

db.defaults({ users: [], chats: [] }).write();

setInterval( async () => {
    db.write();
}, 1000);

vk.updates.on('new_message', async (context, next) => {
    if (context.senderId < 1 || context.isOutbox) return;
    if (!context.isChat) return context.send('Только в беседе!');

    await context.loadMessagePayload();

    let user = db.get('users').find({ id: context.senderId }).value();

    if (!user) {
        db.get('users').push({
            id: context.senderId,
            warns: 0,
            role: 1,
            ban: false,
            mute: 0
        }).write();
        return user;
    } else {
        if (user.mute > Date.now()) {
            if (user.warns + 1 == 3) {
                context.send('Пользователь получает третье предупреждение за нарушение мута и исключается из беседы');
                vk.api.messages.removeChatUser({
                    chat_id: context.chatId, user_id: user.id
                });
                return;
            }
            user.warns++;
            context.send('Пользователь получает предупреждение за нарушение мута');
        }
        return next();
    }
});

vk.updates.on('chat_invite_user', (context, next) => {
    let user = db.get('users').find({ id: Number(context.eventMemberId) }).value();
    if (user) {
        if (user.ban) {
            context.send('В беседу был приглашен забаненый пользователь!\nОн будет исключён.');
            return vk.api.messages.removeChatUser({ chat_id: context.chatId, user_id: user.id });
        }
        user.warns = 0;
        user.role = 0;
        user.mute = 0;
        return next();
    }
    
    return next()
})

vk.updates.hear(/^(?:!mute|!мут)\s([0-9]+)$/i, async (context) => {
    let user = db.get('users').find({ id: context.senderId }).value();

    if (user.role < 2) return context.send('У тебя недостаточно прав!');
    if (!context.hasReplyMessage) return context.send('Нужно переслать сообщение!');

    const reply = db.get('users').find({ id: context.replyMessage.senderId }).value();
    if (user.id == reply.id) return context.send('Нельзя выдать мут самому себе :(');
    if (reply.role > user.role) {
        user.warns++;
        if (user.warns == 3) {
            vk.api.messages.removeChatUser({
                chat_id: context.chatId, user_id: user.id
            });
            return context.send(`@id${user.id} (Пользователь) был исключен!`);
        }
        return context.send(`Нельзя выдать мут пользователю с высшей ролью!\n@id${user.id} (Вам) выдано предупреждение!`);
    }

    const seconds = Number(context.$match[1]) * 1000;
    reply.mute = Date.now() + seconds;
    context.send(`Пользователь был заткнут на ${context.$match[1]} сек.`);
});

vk.updates.hear(/^(?:!ban|!бан)$/i, async (context) => {
    let user = db.get('users').find({ id: context.senderId }).value();

    if (user.role < 3) return context.send('У тебя недостаточно прав!');
    if (!context.hasReplyMessage) return context.send('Нужно переслать сообщение!');

    const reply = db.get('users').find({ id: context.replyMessage.senderId }).value();
    if (user.id == reply.id) return context.send('Нельзя выдать бан самому себе :(');
    if (reply.role > user.role) {
        user.warns++;
        if (user.warns == 3) {
            vk.api.messages.removeChatUser({
                chat_id: context.chatId, user_id: user.id
            });
            return context.send(`@id${user.id} (Пользователь) был исключен!`);
        }
        return context.send(`Нельзя выдать бан пользователю с высшей ролью!\n@id${user.id} (Вам) выдано предупреждение!`);
    }
    reply.ban = true;
    context.send(`@id${u.id}(Пользователь) был забанен в беседе!`);
    vk.api.messages.removeChatUser({ chat_id: context.chatId, user_id: reply.id });
});

vk.updates.hear(/^(?:!warn|!пред|!предупреждение)$/i, async (context) => {
    let user = db.get('users').find({ id: context.senderId }).value();

    if (user.role < 2) return context.send('У тебя недостаточно прав!');
    if (!context.hasReplyMessage) return context.send('Нужно переслать сообщение!');

    const reply = db.get('users').find({ id: context.replyMessage.senderId }).value();
    if (user.id == reply.id) return context.send('Нельзя выдать предупреждение самому себе :(');
    if (reply.role > user.role) {
        user.warns++;
        if (user.warns == 3) {
            vk.api.messages.removeChatUser({
                chat_id: context.chatId, user_id: user.id
            });
            return context.send(`@id${user.id} (Пользователь) был исключен!`);
        }
        return context.send(`Нельзя выдать предупреждение пользователю с высшей ролью!\n@id${user.id} (Вам) выдано предупреждение!`);
    }
    if (reply.warns + 1 == 3) {
        context.send('Пользователь получает третье предупреждение за нарушение мута и исключается из беседы');
        vk.api.messages.removeChatUser({
            chat_id: context.chatId, user_id: reply.id
        });
        return;
    }
    reply.warns++;
    context.send(`@id${reply.id} (Пользователь) получил 1 предупреждение`);
});

vk.updates.hear(/^(?:!kick|!кик)$/i, async (context) => {
    let user = db.get('users').find({ id: context.senderId }).value();

    if (user.role < 2) return context.send('У тебя недостаточно прав!');
    if (!context.hasReplyMessage) return context.send('Нужно переслать сообщение!');

    const reply = db.get('users').find({ id: context.replyMessage.senderId }).value();
    if (user.id == reply.id) return context.send('Нельзя кикнуть самому себе :(');
    if (reply.role > user.role) {
        user.warns++;
        if (user.warns == 3) {
            vk.api.messages.removeChatUser({
                chat_id: context.chatId, user_id: user.id
            });
            return context.send(`@id${user.id} (Пользователь) был исключен!`);
        }
        return context.send(`Нельзя кикнуть пользователю с высшей ролью!\n@id${user.id} (Вам) выдано предупреждение!`);
    }
    vk.api.messages.removeChatUser({ chat_id: msg.chatId, user_id: reply.id })
    context.send(`@id${reply.id}(Пользователь) был кикнут из беседы`);
})

vk.updates.start().catch(console.error);

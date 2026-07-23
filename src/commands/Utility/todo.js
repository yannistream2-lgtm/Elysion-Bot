import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import crypto from 'crypto';

function generateShareId() {
    return crypto.randomBytes(16).toString('hex');
}

export default {
    data: new SlashCommandBuilder()
        .setName("todo")
        .setDescription("Gérer votre liste de tâches personnelle")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Ajouter une tâche à votre liste")
                .addStringOption(option =>
                    option
                        .setName("task")
                        .setDescription("La tâche à ajouter")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("Afficher votre liste de tâches")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("complete")
                .setDescription("Marquer une tâche comme terminée")
                .addIntegerOption(option =>
                    option
                        .setName("number")
                        .setDescription("Le numéro de la tâche à terminer")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Supprimer une tâche de votre liste")
                .addIntegerOption(option =>
                    option
                        .setName("number")
                        .setDescription("Le numéro de la tâche à supprimer")
                        .setRequired(true)
                )
        )
        .addSubcommandGroup(group => 
            group
                .setName("share")
                .setDescription("Gérer les listes de tâches partagées")
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("create")
                        .setDescription("Créer une nouvelle liste de tâches partagée")
                        .addStringOption(option =>
                            option
                                .setName("name")
                                .setDescription("Nom de la liste partagée")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("add")
                        .setDescription("Ajouter un membre à une liste partagée")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID de la liste partagée")
                                .setRequired(true)
                        )
                        .addUserOption(option =>
                            option
                                .setName("user")
                                .setDescription("Utilisateur à ajouter à la liste")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("view")
                        .setDescription("Afficher une liste de tâches partagée")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID de la liste partagée")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("addtask")
                        .setDescription("Ajouter une tâche à une liste partagée")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID de la liste partagée")
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName("task")
                                .setDescription("La tâche à ajouter")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("remove")
                        .setDescription("Supprimer une tâche d'une liste partagée")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID de la liste partagée")
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName("number")
                                .setDescription("Le numéro de la tâche à supprimer")
                                .setRequired(true)
                        )
                )
        )
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: "Utilitaire",

    async execute(interaction, config, client) {
        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();
        const shareSubcommand = interaction.options.getSubcommandGroup() === 'share'
            ? interaction.options.getSubcommand()
            : null;

        async function getOrCreateSharedList(listId, creatorId = null, listName = null) {
            const listKey = `shared_todo_${listId}`;
            let listData = await getFromDb(listKey, null);
            
            if (!listData || (listData.ok === false && listData.error)) {
                if (creatorId) {
                    listData = {
                        id: listId,
                        name: listName,
                        creatorId,
                        members: [creatorId],
                        tasks: [],
                        nextId: 1,
                        createdAt: new Date().toISOString()
                    };

                    await setInDb(listKey, listData);
                } else {
                    return null;
                }
            }
            
            if (listData) {
                if (!Array.isArray(listData.tasks)) listData.tasks = [];
                if (!listData.nextId) listData.nextId = 1;
                if (!Array.isArray(listData.members)) listData.members = [];
            }
            
            return listData;
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(`Échec du report de l'interaction Todo`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'todo'
            });
            return;
        }

        if (shareSubcommand) {
            switch (shareSubcommand) {

                case 'create': {
                    const listName = interaction.options.getString('name');
                    const listId = generateShareId();

                    await getOrCreateSharedList(listId, userId, listName);

                    const userSharedLists = await getFromDb(`user_shared_lists_${userId}`, []);
                    const sharedListsArray = Array.isArray(userSharedLists) ? userSharedLists : [];

                    if (!sharedListsArray.includes(listId)) {
                        sharedListsArray.push(listId);
                        await setInDb(`user_shared_lists_${userId}`, sharedListsArray);
                    }

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                "Liste partagée créée",
                                `La liste partagée **"${listName}"** a été créée avec l'ID : \`${listId}\`\n` +
                                `Utilisez \`/todo share add list_id:${listId} user:@username\` pour ajouter des membres.`
                            )
                        ]
                    });
                }

                case 'add': {
                    const listId = interaction.options.getString('list_id');
                    const memberToAdd = interaction.options.getUser('user');

                    const listData = await getOrCreateSharedList(listId);

                    if (!listData) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Liste partagée introuvable.'
                        });
                    }

                    if (listData.creatorId !== userId) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Seul le créateur de la liste peut ajouter des membres.'
                        });
                    }

                    if (!listData.members.includes(memberToAdd.id)) {
                        listData.members.push(memberToAdd.id);

                        await setInDb(`shared_todo_${listId}`, listData);

                        const memberLists = await getFromDb(`user_shared_lists_${memberToAdd.id}`, []);
                        const memberListsArray = Array.isArray(memberLists) ? memberLists : [];

                        if (!memberListsArray.includes(listId)) {
                            memberListsArray.push(listId);
                            await setInDb(`user_shared_lists_${memberToAdd.id}`, memberListsArray);
                        }

                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed(
                                    'Membre ajouté',
                                    `${memberToAdd.username} a été ajouté à la liste partagée **"${listData.name}"**.`
                                )
                            ]
                        });
                    } else {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Cet utilisateur est déjà membre de cette liste.'
                        });
                    }
                }

                case 'view': {
                    const listId = interaction.options.getString('list_id');
                    const listData = await getOrCreateSharedList(listId);

                    if (!listData) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Liste partagée introuvable.'
                        });
                    }

                    if (!listData.members.includes(userId)) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Vous n\'avez pas accès à cette liste.'
                        });
                    }

                    if (listData.tasks.length === 0) {
                        const memberList = listData.members.map(memberId => {
                            const member = interaction.guild.members.cache.get(memberId);
                            return member ? member.user.username : `<@${memberId}>`;
                        }).join(', ');

                        const owner = interaction.guild.members.cache.get(listData.creatorId);
                        const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed(
                                    `📋 **${listData.name}**\n\n` +
                                    `👑 **Propriétaire :** ${ownerName}\n` +
                                    `👥 **Membres :** ${memberList}\n\n` +
                                    `*Cette liste est actuellement vide. Utilisez le bouton "Ajouter une tâche" pour ajouter des tâches !*`,
                                    `Liste partagée (ID : \`${listId}\`)`
                                )
                            ],
                            components: [
                                new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(`shared_todo_add_${listId}`)
                                        .setLabel('Ajouter une tâche')
                                        .setStyle(ButtonStyle.Primary),

                                    new ButtonBuilder()
                                        .setCustomId(`shared_todo_complete_${listId}`)
                                        .setLabel('Terminer une tâche')
                                        .setStyle(ButtonStyle.Success),

                                    new ButtonBuilder()
                                        .setCustomId(`shared_todo_remove_${listId}`)
                                        .setLabel('Supprimer une tâche')
                                        .setStyle(ButtonStyle.Danger)
                                )
                            ]
                        });
                    }

                    const taskList = listData.tasks
                        .map(task =>
                            `${task.completed ? '✅' : '📝'} #${task.id} ${task.text}` +
                            `\`[${new Date(task.createdAt).toLocaleDateString()}]` +
                            (task.completed ? ` • Terminée par ${task.completedBy}` : '') + '`'
                        )
                        .join('\n');

                    const memberList = listData.members.map(memberId => {
                        const member = interaction.guild.members.cache.get(memberId);
                        return member ? member.user.username : `<@${memberId}>`;
                    }).join(', ');

                    const owner = interaction.guild.members.cache.get(listData.creatorId);
                    const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

                    const fullListDisplay =
                        `📋 **${listData.name}**\n\n` +
                        `👑 **Propriétaire :** ${ownerName}\n` +
                        `👥 **Membres :** ${memberList}\n\n` +
                        `**Tâches :**\n${taskList}`;

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                `Liste partagée (ID : \`${listId}\`)`,
                                fullListDisplay
                            )
                        ],
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_add_${listId}`)
                                    .setLabel('Ajouter une tâche')
                                    .setStyle(ButtonStyle.Primary),

                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_complete_${listId}`)
                                    .setLabel('Terminer une tâche')
                                    .setStyle(ButtonStyle.Success),

                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_remove_${listId}`)
                                    .setLabel('Supprimer une tâche')
                                    .setStyle(ButtonStyle.Danger)
                            )
                        ]
                    });
                }

                case 'addtask': {
                    const listId = interaction.options.getString('list_id');
                    const taskText = interaction.options.getString('task');

                    const listData = await getOrCreateSharedList(listId);

                    if (!listData) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Liste partagée introuvable.'
                        });
                    }

                    if (!listData.members.includes(userId)) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Vous n\'avez pas accès à cette liste.'
                        });
                    }

                    const newTask = {
                        id: listData.nextId++,
                        text: taskText,
                        completed: false,
                        createdAt: new Date().toISOString(),
                        createdBy: userId
                    };

                    listData.tasks.push(newTask);

                    await setInDb(`shared_todo_${listId}`, listData);

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                'Tâche ajoutée',
                                `La tâche **"${taskText}"** a été ajoutée à la liste partagée **"${listData.name}"**.`
                            )
                        ]
                    });
                }

                case 'remove': {
                    const listId = interaction.options.getString('list_id');
                    const taskNumber = interaction.options.getInteger('number');

                    const listData = await getOrCreateSharedList(listId);

                    if (!listData) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Liste partagée introuvable.'
                        });
                    }

                    if (!listData.members.includes(userId)) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Vous n\'avez pas accès à cette liste.'
                        });
                    }

                    const taskIndex = listData.tasks.findIndex(task => task.id === taskNumber);

                    if (taskIndex === -1) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Tâche introuvable.'
                        });
                    }

                    const [removedTask] = listData.tasks.splice(taskIndex, 1);

                    await setInDb(`shared_todo_${listId}`, listData);

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                'Tâche supprimée',
                                `La tâche **"${removedTask.text}"** a été supprimée de la liste partagée **"${listData.name}"**.`
                            )
                        ]
                    });
                }
            }

            return;
        }

        const dbKey = `todo_${userId}`;

        const userData = await getFromDb(dbKey, {
            tasks: [],
            nextId: 1
        });

        if (!userData.tasks) userData.tasks = [];
        if (!userData.nextId) userData.nextId = 1;

        switch (subcommand) {

            case 'add': {
                const taskText = interaction.options.getString('task');

                const newTask = {
                    id: userData.nextId++,
                    text: taskText,
                    completed: false,
                    createdAt: new Date().toISOString()
                };

                userData.tasks.push(newTask);

                await setInDb(dbKey, userData);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Tâche ajoutée",
                            `La tâche **"${taskText}"** a été ajoutée à votre liste de tâches.`
                        ),
                    ],
                });
            }

            case 'list': {
                if (userData.tasks.length === 0) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                'Votre liste de tâches est vide !',
                                "Votre liste de tâches"
                            )
                        ],
                    });
                }

                const taskList = userData.tasks
                    .map(task =>
                        `${task.completed ? '✅' : '📝'} #${task.id} ${task.text}` +
                        `\`[${new Date(task.createdAt).toLocaleDateString()}]\``
                    )
                    .join('\n');

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            'Votre liste de tâches',
                            taskList
                        )
                    ],
                });
            }

            case 'complete': {
                const taskNumber = interaction.options.getInteger('number');
                const task = userData.tasks.find(t => t.id === taskNumber);

                if (!task) {
                    return await replyUserError(interaction, {
                        type: ErrorTypes.UNKNOWN,
                        message: 'Tâche introuvable.'
                    });
                }

                if (task.completed) {
                    return await replyUserError(interaction, {
                        type: ErrorTypes.UNKNOWN,
                        message: `La tâche #${task.id} est déjà terminée.`
                    });
                }

                task.completed = true;

                await setInDb(`todo_${userId}`, userData);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            'Tâche terminée',
                            `La tâche **"${task.text}"** a été marquée comme terminée !`
                        )
                    ],
                });
            }

            case 'remove': {
                const taskNumber = interaction.options.getInteger('number');
                const taskIndex = userData.tasks.findIndex(t => t.id === taskNumber);

                if (taskIndex === -1) {
                    return await replyUserError(interaction, {
                        type: ErrorTypes.UNKNOWN,
                        message: 'Tâche introuvable.'
                    });
                }

                const [removedTask] = userData.tasks.splice(taskIndex, 1);

                await setInDb(`todo_${userId}`, userData);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            'Tâche supprimée',
                            `La tâche **"${removedTask.text}"** a été supprimée de votre liste de tâches.`
                        )
                    ],
                });
            }

            default:
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Sous-commande invalide.'
                });
        }
    },
};

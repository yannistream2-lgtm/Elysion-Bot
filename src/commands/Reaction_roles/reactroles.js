import { getColor } from '../../config/bot.js';
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    LabelBuilder,
    CheckboxBuilder,
    TextDisplayBuilder
} from 'discord.js';

import {
    createEmbed,
    successEmbed,
    infoEmbed,
    warningEmbed
} from '../../utils/embeds.js';

import { logger } from '../../utils/logger.js';

import {
    createError,
    TitanBotError,
    ErrorTypes,
    replyUserError
} from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

import {
    createReactionRoleMessage,
    hasDangerousPermissions,
    getAllReactionRoleMessages,
    deleteReactionRoleMessage
} from '../../services/reactionRoleService.js';

import {
    logEvent,
    EVENT_TYPES
} from '../../services/loggingService.js';

import {
    getReactionRolePanelStatus,
    formatPanelStatusField
} from '../../utils/panelStatus.js';

import { startDashboardSession } from '../../utils/dashboardSession.js';
import { getReactionRoleKey } from '../../utils/database/keys.js';

const DASHBOARD_EPHEMERAL = MessageFlags.Ephemeral;
const SELECT_OPTION_LABEL_LIMIT = 100;
const SELECT_OPTION_DESCRIPTION_LIMIT = 100;

function truncateText(value, maxLength) {
    const text = String(value ?? '');
    return text.length > maxLength
        ? text.substring(0, maxLength)
        : text;
}

export default {
    data: new SlashCommandBuilder()
        .setName('reactroles')
        .setDescription('Gérer les rôles automatiques')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Créer un nouveau panneau de rôles automatiques')

                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Salon dans lequel envoyer le panneau de rôles')
                        .addChannelTypes(
                            ChannelType.GuildText,
                            ChannelType.GuildAnnouncement
                        )
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName('title')
                        .setDescription('Titre du panneau de rôles')
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('Description du panneau de rôles')
                        .setRequired(true)
                )

                .addRoleOption(option =>
                    option
                        .setName('role1')
                        .setDescription('Premier rôle à ajouter')
                        .setRequired(true)
                )

                .addRoleOption(option =>
                    option
                        .setName('role2')
                        .setDescription('Deuxième rôle à ajouter')
                        .setRequired(false)
                )

                .addRoleOption(option =>
                    option
                        .setName('role3')
                        .setDescription('Troisième rôle à ajouter')
                        .setRequired(false)
                )

                .addRoleOption(option =>
                    option
                        .setName('role4')
                        .setDescription('Quatrième rôle à ajouter')
                        .setRequired(false)
                )

                .addRoleOption(option =>
                    option
                        .setName('role5')
                        .setDescription('Cinquième rôle à ajouter')
                        .setRequired(false)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Gérer et configurer vos panneaux de rôles')
                .addStringOption(option =>
                    option
                        .setName('panel')
                        .setDescription('Sélectionner un panneau de rôles à gérer')
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            await handleSetup(interaction);
        } else if (subcommand === 'dashboard') {
            const selectedPanelId = interaction.options.getString('panel');
            await handleDashboard(interaction, selectedPanelId);
        }
    },

    async autocomplete(interaction) {
        if (interaction.commandName !== 'reactroles') return;
        if (interaction.options.getSubcommand() !== 'dashboard') return;

        // L'autocomplétion doit répondre sous 3 secondes.
        // On utilise uniquement les données stockées et les éléments en cache.
        try {
            const guildId = interaction.guild.id;
            const client = interaction.client;
            const guild = interaction.guild;

            let panels;

            try {
                panels = await getAllReactionRoleMessages(client, guildId);
            } catch {
                await interaction.respond([]).catch(() => {});
                return;
            }

            if (!panels?.length) {
                await interaction.respond([]).catch(() => {});
                return;
            }

            const choices = [];

            for (const panel of panels) {
                if (!panel.messageId || !panel.channelId) continue;

                const channel = guild.channels.cache.get(panel.channelId);
                if (!channel) continue;

                const cachedTitle =
                    channel.messages?.cache
                        ?.get(panel.messageId)
                        ?.embeds?.[0]?.title;

                const roleCount = Array.isArray(panel.roles)
                    ? panel.roles.length
                    : 0;

                const label = cachedTitle
                    ? `${cachedTitle} (#${channel.name})`
                    : `#${channel.name} · ${roleCount} rôle${roleCount === 1 ? '' : 's'}`;

                choices.push({
                    name: label.substring(0, 100),
                    value: panel.messageId
                });

                if (choices.length >= 25) break;
            }

            await interaction.respond(choices).catch(() => {});
        } catch {
            await interaction.respond([]).catch(() => {});
        }
    }
};

async function handleSetup(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    logger.info(
        `Création d'un panneau de rôles initiée par ${interaction.user.tag} sur ${interaction.guild.name}`
    );

    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');

    if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
    ) {
        throw createError(
            `Type de salon invalide : ${channel.type}`,
            ErrorTypes.VALIDATION,
            'Veuillez sélectionner un salon textuel ou d\'annonces.',
            { channelType: channel.type }
        );
    }

    if (
        !interaction.guild.members.me.permissions.has(
            PermissionFlagsBits.ManageRoles
        )
    ) {
        throw createError(
            'Permission Gérer les rôles manquante',
            ErrorTypes.PERMISSION,
            'J\'ai besoin de la permission « Gérer les rôles » pour configurer les rôles automatiques.',
            { permission: 'ManageRoles' }
        );
    }

    if (
        !channel
            .permissionsFor(interaction.guild.members.me)
            .has(PermissionFlagsBits.SendMessages)
    ) {
        throw createError(
            `Le bot ne peut pas envoyer de messages dans ${channel.name}`,
            ErrorTypes.PERMISSION,
            `Je n'ai pas la permission d'envoyer des messages dans ${channel}.`,
            { channelId: channel.id }
        );
    }

    const existingPanels = await getAllReactionRoleMessages(
        interaction.client,
        interaction.guildId
    );

    if (existingPanels && existingPanels.length >= 5) {
        throw createError(
            'Limite de panneaux atteinte',
            ErrorTypes.VALIDATION,
            'Votre serveur a atteint la limite maximale de 5 panneaux de rôles. Supprimez un panneau existant pour en créer un nouveau.',
            {
                maxPanels: 5,
                currentPanels: existingPanels.length
            }
        );
    }

    const roles = [];
    const roleValidationErrors = [];
    const seenRoleIds = new Set();

    for (let i = 1; i <= 5; i++) {
        const role = interaction.options.getRole(`role${i}`);

        if (role) {
            if (seenRoleIds.has(role.id)) {
                roleValidationErrors.push(
                    `**${role.name}** - Ce rôle a été sélectionné plusieurs fois`
                );
                continue;
            }

            if (
                role.position >=
                interaction.guild.members.me.roles.highest.position
            ) {
                roleValidationErrors.push(
                    `**${role.name}** - Le rôle du bot est placé en dessous de ce rôle dans la hiérarchie et ne peut pas l'attribuer`
                );
                continue;
            }

            if (hasDangerousPermissions(role)) {
                roleValidationErrors.push(
                    `**${role.name}** - Ce rôle possède des permissions dangereuses (Administrateur, Gérer le serveur, etc.)`
                );
                continue;
            }

            if (role.managed) {
                roleValidationErrors.push(
                    `**${role.name}** - Il s'agit d'un rôle géré (intégration/bot)`
                );
                continue;
            }

            if (role.id === interaction.guild.id) {
                roleValidationErrors.push(
                    `**${role.name}** - Le rôle @everyone ne peut pas être utilisé`
                );
                continue;
            }

            seenRoleIds.add(role.id);
            roles.push(role);
        }
    }

    if (roleValidationErrors.length > 0) {
        const errorMsg =
            `Les rôles suivants ne peuvent pas être ajoutés :\n` +
            roleValidationErrors.join('\n');

        if (roles.length === 0) {
            throw createError(
                'Aucun rôle valide',
                ErrorTypes.VALIDATION,
                errorMsg,
                { errors: roleValidationErrors }
            );
        }

        await interaction.followUp({
            embeds: [
                warningEmbed(
                    'Avertissement concernant les rôles',
                    errorMsg
                )
            ],
            flags: MessageFlags.Ephemeral
        });
    }

    if (roles.length < 1) {
        throw createError(
            'Aucun rôle fourni',
            ErrorTypes.VALIDATION,
            'Vous devez fournir au moins un rôle valide.',
            {}
        );
    }

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('reaction_roles')
            .setPlaceholder('Sélectionnez vos rôles')
            .setMinValues(0)
            .setMaxValues(roles.length)
            .addOptions(
                roles.map(role => ({
                    label: truncateText(
                        role.name,
                        SELECT_OPTION_LABEL_LIMIT
                    ),
                    description: truncateText(
                        `Ajouter/retirer le rôle ${role.name}`,
                        SELECT_OPTION_DESCRIPTION_LIMIT
                    ),
                    value: role.id,
                    emoji: '🎭'
                }))
            )
    );

    const panelEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(getColor('info'))
        .addFields({
            name: 'Rôles disponibles',
            value: roles.map(role => `• ${role}`).join('\n')
        })
        .setFooter({
            text: 'Sélectionnez vos rôles dans le menu déroulant ci-dessous'
        });

    const message = await channel.send({
        embeds: [panelEmbed],
        components: [row]
    });

    const roleIds = roles.map(role => role.id);

    try {
        await createReactionRoleMessage(
            interaction.client,
            interaction.guildId,
            channel.id,
            message.id,
            roleIds
        );
    } catch (saveError) {
        // Le panneau a été envoyé mais les données n'ont pas pu être sauvegardées.
        // On supprime le message pour éviter de laisser un panneau inutilisable.
        await message.delete().catch(() => {});
        throw saveError;
    }

    logger.info(
        `Panneau de rôles créé : ${message.id} avec ${roles.length} rôles par ${interaction.user.tag}`
    );

    try {
        await logEvent({
            client: interaction.client,
            guildId: interaction.guildId,
            eventType: EVENT_TYPES.REACTION_ROLE_CREATE,
            data: {
                description: `Panneau de rôles créé par ${interaction.user.tag}`,
                userId: interaction.user.id,
                channelId: channel.id,
                fields: [
                    {
                        name: 'Titre',
                        value: title,
                        inline: false
                    },
                    {
                        name: 'Salon',
                        value: channel.toString(),
                        inline: true
                    },
                    {
                        name: 'Rôles',
                        value: `${roles.length} rôle(s)`,
                        inline: true
                    },
                    {
                        name: 'Liste des rôles',
                        value: roles
                            .map(r => r.toString())
                            .join(','),
                        inline: false
                    },
                    {
                        name: 'Lien du message',
                        value: message.url,
                        inline: false
                    }
                ]
            }
        });
    } catch (logError) {
        logger.warn(
            'Impossible d\'enregistrer la création du panneau de rôles :',
            logError
        );
    }

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                'Succès',
                `✅ Le panneau de rôles a été créé dans ${channel} !\n\n${message.url}`
            )
        ]
    });
}

async function fetchPanelDiscordMessage(guild, panelData) {
    try {
        const channel = guild.channels.cache.get(
            panelData.channelId
        );

        if (!channel) return null;

        return await channel.messages
            .fetch(panelData.messageId)
            .catch(() => null);
    } catch {
        return null;
    }
}

async function rebuildLivePanelMessage(guild, panelData) {
    try {
        const channel = guild.channels.cache.get(
            panelData.channelId
        );

        if (!channel) return;

        const msg = await channel.messages
            .fetch(panelData.messageId)
            .catch(() => null);

        if (!msg || !msg.embeds[0]) return;

        const roleObjects = panelData.roles
            .map(id => guild.roles.cache.get(id))
            .filter(Boolean);

        if (roleObjects.length === 0) return;

        const currentEmbed = msg.embeds[0];
        const updatedEmbed = EmbedBuilder.from(currentEmbed);

        const fields = currentEmbed.fields.map(f => ({
            name: f.name,
            value: f.value,
            inline: f.inline
        }));

        const roleFieldIdx = fields.findIndex(
            f => f.name === 'Rôles disponibles'
        );

        const newRoleValue = roleObjects
            .map(r => `• ${r}`)
            .join('\n');

        if (roleFieldIdx !== -1) {
            fields[roleFieldIdx] = {
                name: 'Rôles disponibles',
                value: newRoleValue,
                inline: false
            };
        } else {
            fields.push({
                name: 'Rôles disponibles',
                value: newRoleValue,
                inline: false
            });
        }

        updatedEmbed.setFields(fields);

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('reaction_roles')
                .setPlaceholder('Sélectionnez vos rôles')
                .setMinValues(0)
                .setMaxValues(roleObjects.length)
                .addOptions(
                    roleObjects.map(r => ({
                        label: r.name.substring(0, 100),
                        description:
                            `Ajouter/retirer le rôle ${r.name}`.substring(
                                0,
                                100
                            ),
                        value: r.id,
                        emoji: '🎭'
                    }))
                )
        );

        await msg.edit({
            embeds: [updatedEmbed],
            components: [selectRow]
        });
    } catch (error) {
        logger.warn(
            'Impossible de reconstruire le panneau de rôles :',
            error.message
        );
    }
}

function buildReactionRoleDashboardPayload(
    panelData,
    discordMsg,
    guildId,
    guild,
    panelStatus = null
) {
    const channel = guild.channels.cache.get(
        panelData.channelId
    );

    const title =
        discordMsg?.embeds?.[0]?.title ??
        'Panneau sans titre';

    const roleList =
        panelData.roles.length > 0
            ? panelData.roles
                .map(id => `<@&${id}>`)
                .join(', ')
            : '`Aucun`';

    const showRepost =
        panelStatus?.exists === false &&
        panelStatus?.reason === 'panel_deleted';

    const embed = new EmbedBuilder()
        .setTitle('Tableau de bord des rôles')
        .setDescription(
            `**Titre :** ${title}\n\n` +
            `Sélectionnez une option ci-dessous pour modifier un paramètre.` +
            (
                discordMsg
                    ? `\n[👁️ Cliquez ici pour voir le panneau](${discordMsg.url})`
                    : ''
            )
        )
        .setColor(getColor('info'))
        .addFields(
            {
                name: 'État du panneau',
                value: formatPanelStatusField(panelStatus),
                inline: false
            },
            {
                name: 'Salon',
                value: channel
                    ? `<#${channel.id}>`
                    : '`Introuvable`',
                inline: true
            },
            {
                name: 'Rôles',
                value: `\`${panelData.roles.length} / 25\``,
                inline: true
            },
            {
                name: '\u200B',
                value: '\u200B',
                inline: true
            },
            {
                name: 'Liste des rôles',
                value: roleList,
                inline: false
            }
        )
        .setFooter({
            text: 'Le tableau de bord se ferme après 10 minutes d\'inactivité'
        })
        .setTimestamp();

    const buttons = [];

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`rr_repost_${guildId}`)
                .setLabel('Republier le panneau')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌')
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`rr_edit_text_${guildId}`)
            .setLabel('Modifier le texte')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️'),

        new ButtonBuilder()
            .setCustomId(`rr_delete_${guildId}`)
            .setLabel('Supprimer le panneau')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
    );

    const optionsSelect =
        new StringSelectMenuBuilder()
            .setCustomId(`rr_opts_${guildId}`)
            .setPlaceholder('Sélectionnez une action...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Ajouter un rôle')
                    .setDescription(
                        'Ajouter un rôle à ce panneau (maximum 25)'
                    )
                    .setValue('add_role')
                    .setEmoji('➕'),

                ...(panelData.roles.length > 0
                    ? [
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Retirer un rôle')
                            .setDescription(
                                'Retirer un rôle de ce panneau'
                            )
                            .setValue('remove_role')
                            .setEmoji('➖')
                    ]
                    : [])
            );

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(buttons),
            new ActionRowBuilder().addComponents(optionsSelect)
        ]
    };
}

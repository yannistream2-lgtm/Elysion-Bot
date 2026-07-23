import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    LabelBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    EmbedBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getLevelingConfig, saveLevelingConfig } from '../../../services/leveling/leveling.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';
import { startDashboardSession } from '../../../utils/dashboardSession.js';

function buildDashboardEmbed(cfg, guild) {
    const channel = cfg.levelUpChannel ? `<#${cfg.levelUpChannel}>` : '`Non configuré`';
    const xpMin = cfg.xpRange?.min ?? cfg.xpPerMessage?.min ?? 15;
    const xpMax = cfg.xpRange?.max ?? cfg.xpPerMessage?.max ?? 25;
    const cooldown = cfg.xpCooldown ?? 60;
    const rawMsg = cfg.levelUpMessage || '{user} est passé au niveau {level} !';
    const msgPreview = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;

    const rewards = cfg.roleRewards ?? {};
    const rewardEntries = Object.entries(rewards).sort(([a], [b]) => Number(a) - Number(b));
    const rewardsValue = rewardEntries.length > 0
        ? rewardEntries.map(([lvl, roleId]) => `Niveau **${lvl}** → <@&${roleId}>`).join('\n')
        : '`Aucune configurée`';

    const ignoredChannels = cfg.ignoredChannels ?? [];
    const ignoredRoles = cfg.ignoredRoles ?? [];

    const ignoredChValue = ignoredChannels.length > 0
        ? ignoredChannels.map(id => `<#${id}>`).join(',')
        : '`Aucun`';

    const ignoredRoValue = ignoredRoles.length > 0
        ? ignoredRoles.map(id => `<@&${id}>`).join(',')
        : '`Aucun`';

    return new EmbedBuilder()
        .setTitle('⚡ Tableau de bord du système de niveaux')
        .setDescription(
            `Gérez les paramètres du système de niveaux pour **${guild.name}**.\nSélectionnez une option ci-dessous pour modifier un paramètre.`
        )
        .setColor(getColor('info'))
        .addFields(
            { name: 'Salon des niveaux', value: channel, inline: true },
            { name: 'État du système', value: cfg.enabled ? '**Activé**' : '**Désactivé**', inline: true },
            { name: 'Annonces', value: cfg.announceLevelUp !== false ? '**Activées**' : '**Désactivées**', inline: true },
            { name: 'XP par message', value: `\`${xpMin} – ${xpMax}\``, inline: true },
            { name: 'Délai entre les XP', value: `\`${cooldown}s\``, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Message de niveau', value: msgPreview, inline: false },
            { name: 'Récompenses de rôles', value: rewardsValue, inline: false },
            { name: 'Salons ignorés', value: ignoredChValue, inline: true },
            { name: 'Rôles ignorés', value: ignoredRoValue, inline: true },
        )
        .setFooter({ text: 'Le tableau de bord se ferme après 10 minutes d’inactivité' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`level_cfg_${guildId}`)
        .setPlaceholder('Sélectionnez un paramètre à configurer...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Modifier le salon des niveaux')
                .setDescription('Définir le salon où les notifications de niveau seront envoyées')
                .setValue('channel')
                .setEmoji('📢'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Modifier le message de niveau')
                .setDescription('Personnaliser le message affiché lorsqu’un utilisateur monte de niveau')
                .setValue('message')
                .setEmoji('💬'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Définir la quantité d’XP')
                .setDescription('Définir le minimum et le maximum d’XP gagnés par message')
                .setValue('xp_range')
                .setEmoji('🎲'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Définir le délai d’XP')
                .setDescription('Définir le délai entre deux gains d’XP pour un même utilisateur')
                .setValue('xp_cooldown')
                .setEmoji('⏱️'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Ajouter une récompense de rôle')
                .setDescription('Attribuer un rôle lorsqu’un utilisateur atteint un niveau précis')
                .setValue('role_reward_add')
                .setEmoji('🏆'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Supprimer une récompense de rôle')
                .setDescription('Supprimer une récompense de rôle associée à un niveau')
                .setValue('role_reward_remove')
                .setEmoji('🗑️'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Salons ignorés')
                .setDescription('Activer ou désactiver les salons où l’XP ne sera pas attribuée')
                .setValue('ignore_channels')
                .setEmoji('🚫'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Rôles ignorés')
                .setDescription('Activer ou désactiver les rôles qui ne recevront pas d’XP')
                .setValue('ignore_roles')
                .setEmoji('🚫'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false) {
    const announceOn = cfg.announceLevelUp !== false;
    const systemOn = cfg.enabled !== false;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`level_cfg_toggle_announce_${guildId}`)
            .setLabel('Annonces')
            .setStyle(announceOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('📣')
            .setDisabled(disabled),

        new ButtonBuilder()
            .setCustomId(`level_cfg_toggle_system_${guildId}`)
            .setLabel('Système de niveaux')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('⚡')
            .setDisabled(disabled),
    );
}

async function refreshDashboard(rootInteraction, cfg, guildId) {
    const selectMenu = buildSelectMenu(guildId);

    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [buildDashboardEmbed(cfg, rootInteraction.guild)],
        components: [
            buildButtonRow(cfg, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

export default {
    prefixOnly: false,

    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const cfg = await getLevelingConfig(client, guildId);

            if (!cfg.configured) {
                throw new TitanBotError(
                    'Leveling system not configured',
                    ErrorTypes.CONFIGURATION,
                    'Le système de niveaux n’a pas encore été configuré. Utilisez `/level setup` pour commencer.',
                );
            }

            await startDashboardSession({
                interaction,

                embeds: [
                    buildDashboardEmbed(cfg, interaction.guild)
                ],

                components: [
                    buildButtonRow(cfg, guildId),
                    new ActionRowBuilder().addComponents(
                        buildSelectMenu(guildId)
                    ),
                ],

                selectMenuId: `level_cfg_${guildId}`,

                buttonMatcher: (customId) =>
                    customId === `level_cfg_toggle_announce_${guildId}` ||
                    customId === `level_cfg_toggle_system_${guildId}`,

                onSelect: async (selectInteraction) => {
                    const selectedOption = selectInteraction.values[0];

                    switch (selectedOption) {
                        case 'channel':
                            await handleChannel(
                                selectInteraction,
                                interaction,
                                cfg,
                                guildId,
                                client
                            );
                            break;

                        case 'message':
                            await handleMessage(
                                selectInteraction,
                                interaction,
                                cfg,
                                guildId,
                                client
                            );
                            break;

                        case 'xp_range':
                            await handleXpRange(
                                selectInteraction,
                                interaction,
                                cfg,
                                guildId,
                                client
                            );
                            break;

                        case 'xp_cooldown':
                            await handleXpCooldown(
                                selectInteraction,
                                interaction,
                                cfg,
                                guildId,
                                client
                            );
                            break;

                        case 'role_reward_add':
                            await handleRoleRewardAdd(
                                selectInteraction,
                                interaction,
                                cfg,
                                guildId,
                                client
                            );
                            break;

                        case 'role_reward_remove':
                            await handleRoleRewardRemove(
                                selectInteraction,
                                interaction,
                                cfg,
                                guildId,
                                client
                            );
                            break;

                        case 'ignore_channels':
                            await handleIgnoreChannels(
                                selectInteraction,
                                interaction,
                                cfg,
                                guildId,
                                client
                            );
                            break;

                        case 'ignore_roles':
                            await handleIgnoreRoles(
                                selectInteraction,
                                interaction,
                                cfg,
                                guildId,
                                client
                            );
                            break;
                    }
                },

                onButton: async (btnInteraction) => {
                    await btnInteraction.deferUpdate().catch(() => null);

                    const isAnnounce =
                        btnInteraction.customId ===
                        `level_cfg_toggle_announce_${guildId}`;

                    if (isAnnounce) {
                        cfg.announceLevelUp = cfg.announceLevelUp === false;

                        await saveLevelingConfig(
                            client,
                            guildId,
                            cfg
                        );

                        await btnInteraction.followUp({
                            embeds: [
                                successEmbed(
                                    '✅ Annonces mises à jour',
                                    `Les annonces de niveau sont maintenant **${cfg.announceLevelUp ? 'activées' : 'désactivées'}**.`,
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,
                        });
                    } else {
                        const wasEnabled = cfg.enabled !== false;
                        cfg.enabled = !wasEnabled;

                        await saveLevelingConfig(
                            client,
                            guildId,
                            cfg
                        );

                        await btnInteraction.followUp({
                            embeds: [
                                successEmbed(
                                    '✅ Système mis à jour',
                                    `Le système de niveaux est maintenant **${cfg.enabled ? 'activé' : 'désactivé'}**.${!cfg.enabled ? '\nLes utilisateurs ne gagneront plus d’XP jusqu’à ce que le système soit réactivé.' : ''}`,
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,
                        });
                    }

                    await refreshDashboard(
                        interaction,
                        cfg,
                        guildId
                    );
                },
            });
        } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }

            logger.error(
                'Unexpected error in level_dashboard:',
                error
            );

            throw new TitanBotError(
                `Level dashboard failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Impossible d’ouvrir le tableau de bord du système de niveaux.',
            );
        }
    },
};

async function handleRoleRewardAdd(
    selectInteraction,
    rootInteraction,
    cfg,
    guildId,
    client
) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_role_reward_add_${guildId}`)
        .setTitle('🏆 Ajouter une récompense de rôle');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('reward_role')
        .setPlaceholder('Sélectionnez un rôle à attribuer...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Rôle à attribuer')
        .setDescription('Ce rôle sera attribué lorsque l’utilisateur atteindra le niveau indiqué')
        .setRoleSelectMenuComponent(roleSelect);

    const levelInput = new TextInputBuilder()
        .setCustomId('reward_level')
        .setLabel('Niveau requis (1–500)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('10')
        .setMaxLength(3)
        .setMinLength(1)
        .setRequired(true);

    modal.addLabelComponents(roleLabel);
    modal.addComponents(
        new ActionRowBuilder().addComponents(levelInput)
    );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === `level_cfg_role_reward_add_${guildId}` &&
                i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const rawLevel = submitted.fields
        .getTextInputValue('reward_level')
        .trim();

    const level = parseInt(rawLevel, 10);

    if (isNaN(level) || level < 1 || level > 500) {
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: 'Le niveau doit être un nombre entier compris entre **1** et **500**.',
        });
        return;
    }

    const roleId = submitted.fields
        .getField('reward_role')
        .values[0];

    cfg.roleRewards = cfg.roleRewards ?? {};
    cfg.roleRewards[level] = roleId;

    await saveLevelingConfig(
        client,
        guildId,
        cfg
    );

    await submitted.reply({
        embeds: [
            successEmbed(
                'Récompense de rôle ajoutée',
                `<@&${roleId}> sera maintenant attribué au niveau **${level}**.`
            )
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(
        rootInteraction,
        cfg,
        guildId
    );
}

async function handleRoleRewardRemove(
    selectInteraction,
    rootInteraction,
    cfg,
    guildId,
    client
) {
    const rewards = cfg.roleRewards ?? {};

    const entries = Object.entries(rewards)
        .sort(([a], [b]) => Number(a) - Number(b));

    if (entries.length === 0) {
        await selectInteraction.deferUpdate();

        await replyUserError(selectInteraction, {
            type: ErrorTypes.USER_INPUT,
            message: 'Aucune récompense de rôle n’est configurée à supprimer.',
        });

        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_role_reward_remove_${guildId}`)
        .setTitle('🗑️ Supprimer une récompense de rôle');

    const infoInput = new TextInputBuilder()
        .setCustomId('current_rewards')
        .setLabel('Récompenses actuelles (lecture seule)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(
            entries
                .map(([lvl, roleId]) =>
                    `Niveau ${lvl} : <@&${roleId}>`
                )
                .join('\n')
        )
        .setRequired(false);

    const levelInput = new TextInputBuilder()
        .setCustomId('remove_level')
        .setLabel('Niveau dont supprimer la récompense')
        .setStyle(TextInputStyle.Short)
        .setValue(entries[0][0])
        .setMaxLength(3)
        .setMinLength(1)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(infoInput),
        new ActionRowBuilder().addComponents(levelInput),
    );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === `level_cfg_role_reward_remove_${guildId}` &&
                i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const rawLevel = submitted.fields
        .getTextInputValue('remove_level')
        .trim();

    const level = parseInt(rawLevel, 10);

    if (isNaN(level) || !cfg.roleRewards?.[level]) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message: `Aucune récompense de rôle n’est configurée pour le niveau **${rawLevel}**.`,
        });

        return;
    }

    delete cfg.roleRewards[level];

    await saveLevelingConfig(
        client,
        guildId,
        cfg
    );

    await submitted.reply({
        embeds: [
            successEmbed(
                'Récompense de rôle supprimée',
                `La récompense de rôle du niveau **${level}** a été supprimée.`
            )
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(
        rootInteraction,
        cfg,
        guildId
    );
}

async function handleChannel(
    selectInteraction,
    rootInteraction,
    cfg,
    guildId,
    client
) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_channel_modal_${guildId}`)
        .setTitle('📢 Modifier le salon des niveaux');

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('levelup_channel')
        .setPlaceholder('Sélectionnez un salon texte...')
        .setMinValues(1)
        .setMaxValues(1)
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true);

    const channelLabel = new LabelBuilder()
        .setLabel('Salon des niveaux')
        .setDescription('Salon où les notifications de niveau seront envoyées')
        .setChannelSelectMenuComponent(channelSelect);

    modal.addLabelComponents(channelLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === `level_cfg_channel_modal_${guildId}` &&
                i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const channelId = submitted.fields
        .getField('levelup_channel')
        .values[0];

    const channel = selectInteraction.guild.channels.cache.get(channelId);

    if (
        channel &&
        !botHasPermission(channel, [
            'SendMessages',
            'EmbedLinks'
        ])
    ) {
        await replyUserError(submitted, {
            type: ErrorTypes.PERMISSION,
            message: `J’ai besoin des permissions **Envoyer des messages** et **Intégrer des liens** dans ${channel} pour envoyer les notifications de niveau.`,
        });

        return;
    }

    cfg.levelUpChannel = channelId;

    await saveLevelingConfig(
        client,
        guildId,
        cfg
    );

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Salon mis à jour',
                `Les notifications de niveau seront maintenant envoyées dans ${channel ?? `<#${channelId}>`}.`
            )
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(
        rootInteraction,
        cfg,
        guildId
    );
}

async function handleIgnoreChannels(
    selectInteraction,
    rootInteraction,
    cfg,
    guildId,
    client
) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_ignore_channels_${guildId}`)
        .setTitle('🚫 Salons ignorés');

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ignore_channel')
        .setPlaceholder('Sélectionnez les salons à modifier...')
        .setMinValues(1)
        .setMaxValues(10)
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true);

    const channelLabel = new LabelBuilder()
        .setLabel('Modifier les salons ignorés')
        .setDescription('Les salons sélectionnés seront activés ou désactivés — aucun XP ne sera attribué dans ces salons')
        .setChannelSelectMenuComponent(channelSelect);

    modal.addLabelComponents(channelLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === `level_cfg_ignore_channels_${guildId}` &&
                i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const selectedIds = submitted.fields
        .getField('ignore_channel')
        .values;

    const ignoreSet = new Set(
        cfg.ignoredChannels ?? []
    );

    for (const id of selectedIds) {
        if (ignoreSet.has(id)) {
            ignoreSet.delete(id);
        } else {
            ignoreSet.add(id);
        }
    }

    cfg.ignoredChannels = Array.from(ignoreSet);

    await saveLevelingConfig(
        client,
        guildId,
        cfg
    );

    const list = cfg.ignoredChannels.length > 0
        ? cfg.ignoredChannels.map(id => `<#${id}>`).join(',')
        : '`Aucun`';

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Salons ignorés mis à jour',
                `Aucun XP ne sera attribué dans : ${list}`
            )
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(
        rootInteraction,
        cfg,
        guildId
    );
}

async function handleIgnoreRoles(
    selectInteraction,
    rootInteraction,
    cfg,
    guildId,
    client
) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_ignore_roles_${guildId}`)
        .setTitle('🚫 Rôles ignorés');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('ignore_role')
        .setPlaceholder('Sélectionnez les rôles à modifier...')
        .setMinValues(1)
        .setMaxValues(10)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Modifier les rôles ignorés')
        .setDescription('Les rôles sélectionnés seront activés ou désactivés — les membres possédant ces rôles ne gagneront pas d’XP')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === `level_cfg_ignore_roles_${guildId}` &&
                i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const selectedIds = submitted.fields
        .getField('ignore_role')
        .values;

    const ignoreSet = new Set(
        cfg.ignoredRoles ?? []
    );

    for (const id of selectedIds) {
        if (ignoreSet.has(id)) {
            ignoreSet.delete(id);
        } else {
            ignoreSet.add(id);
        }
    }

    cfg.ignoredRoles = Array.from(ignoreSet);

    await saveLevelingConfig(
        client,
        guildId,
        cfg
    );

    const list = cfg.ignoredRoles.length > 0
        ? cfg.ignoredRoles.map(id => `<@&${id}>`).join(',')
        : '`Aucun`';

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Rôles ignorés mis à jour',
                `Ces rôles ne gagneront pas d’XP : ${list}`
            )
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(
        rootInteraction,
        cfg,
        guildId
    );
}

async function handleMessage(
    selectInteraction,
    rootInteraction,
    cfg,
    guildId,
    client
) {
    const modal = new ModalBuilder()
        .setCustomId('level_cfg_message')
        .setTitle('💬 Modifier le message de niveau')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('Message ({user} et {level} sont disponibles)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(
                        cfg.levelUpMessage ||
                        '{user} est passé au niveau {level} !'
                    )
                    .setMaxLength(500)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder(
                        '{user} est passé au niveau {level} !'
                    ),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_message' &&
                i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newMessage = submitted.fields
        .getTextInputValue('message_input')
        .trim();

    if (
        !newMessage.includes('{user}') &&
        !newMessage.includes('{level}')
    ) {
        logger.warn(
            `Level-up message set without {user} or {level} placeholders in guild ${guildId}`,
        );
    }

    cfg.levelUpMessage = newMessage;

    await saveLevelingConfig(
        client,
        guildId,
        cfg
    );

    const preview = newMessage
        .replace('{user}', '@Utilisateur')
        .replace('{level}', '5');

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Message mis à jour',
                `Le message de niveau a été enregistré.\n**Aperçu :** ${preview}`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(
        rootInteraction,
        cfg,
        guildId
    );
}

async function handleXpRange(
    selectInteraction,
    rootInteraction,
    cfg,
    guildId,
    client
) {
    const currentMin =
        cfg.xpRange?.min ??
        cfg.xpPerMessage?.min ??
        15;

    const currentMax =
        cfg.xpRange?.max ??
        cfg.xpPerMessage?.max ??
        25;

    const modal = new ModalBuilder()
        .setCustomId('level_cfg_xp_range')
        .setTitle('Définir l’XP par message')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('xp_min_input')
                    .setLabel('XP minimum (1–500)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(currentMin))
                    .setMaxLength(3)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('15'),
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('xp_max_input')
                    .setLabel('XP maximum (1–500)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(currentMax))
                    .setMaxLength(3)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('25'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_xp_range' &&
                i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const rawMin = submitted.fields
        .getTextInputValue('xp_min_input')
        .trim();

    const rawMax = submitted.fields
        .getTextInputValue('xp_max_input')
        .trim();

    const newMin = parseInt(rawMin, 10);
    const newMax = parseInt(rawMax, 10);

    if (
        isNaN(newMin) ||
        isNaN(newMax) ||
        newMin < 1 ||
        newMax < 1 ||
        newMin > 500 ||
        newMax > 500
    ) {
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: 'Les deux valeurs d’XP doivent être des nombres entiers compris entre **1** et **500**.',
        });

        return;
    }

    if (newMin > newMax) {
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: 'L’XP minimum ne peut pas être supérieure à l’XP maximum.',
        });

        return;
    }

    cfg.xpRange = {
        min: newMin,
        max: newMax
    };

    await saveLevelingConfig(
        client,
        guildId,
        cfg
    );

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Quantité d’XP mise à jour',
                `Les utilisateurs gagneront maintenant entre **${newMin}** et **${newMax}** XP par message.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(
        rootInteraction,
        cfg,
        guildId
    );
}

async function handleXpCooldown(
    selectInteraction,
    rootInteraction,
    cfg,
    guildId,
    client
) {
    const modal = new ModalBuilder()
        .setCustomId('level_cfg_cooldown')
        .setTitle('⏱️ Définir le délai d’XP')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('cooldown_input')
                    .setLabel('Délai en secondes (0–3600)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(
                        String(cfg.xpCooldown ?? 60)
                    )
                    .setMaxLength(4)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('60'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_cooldown' &&
                i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const raw = submitted.fields
        .getTextInputValue('cooldown_input')
        .trim();

    const newCooldown = parseInt(raw, 10);

    if (
        isNaN(newCooldown) ||
        newCooldown < 0 ||
        newCooldown > 3600
    ) {
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: 'Le délai doit être un nombre entier compris entre **0** et **3600** secondes.',
        });

        return;
    }

    cfg.xpCooldown = newCooldown;

    await saveLevelingConfig(
        client,
        guildId,
        cfg
    );

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Délai mis à jour',
                `Le délai d’XP est maintenant de **${newCooldown} seconde${newCooldown !== 1 ? 's' : ''}**.${newCooldown === 0 ? '\n> ⚠️ Un délai de 0 signifie que l’XP sera attribuée à chaque message.' : ''}`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(
        rootInteraction,
        cfg,
        guildId
    );
}

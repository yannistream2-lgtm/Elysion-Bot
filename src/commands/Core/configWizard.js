import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    LabelBuilder,
    ChannelType,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed, buildUserErrorEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildConfig, setConfigValue } from '../../services/config/guildConfig.js';
import ConfigService from '../../services/config/configService.js';
import { logger } from '../../utils/logger.js';
import { botConfig, getCommandPrefix } from '../../config/bot.js';

const DASHBOARD_CUSTOM_ID = 'config_select';
const WIZARD_BUTTON_ID = 'config_wizard';
const activeWizardSessions = new Set();

const DM_DISABLED_HELP = [
    '1. Faites un clic droit sur le nom de ce serveur (sur mobile : appuyez sur le nom du serveur en haut).',
    '2. Ouvrez les **Paramètres de confidentialité**.',
    '3. Activez **Autoriser les messages privés des membres du serveur**.',
    '4. Cliquez à nouveau sur **Démarrer l\'assistant de configuration**.',
].join('\n');

async function notifyWizardStarted(buttonInteraction) {
    await buttonInteraction.followUp({
        embeds: [infoEmbed(
            'Assistant de configuration démarré',
            'Vérifiez vos messages privés — je vous ai envoyé la première question.\n\nRépondez à chaque question dans ce message privé. Tapez `skip` pour conserver la valeur actuelle.',
        )],
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});
}

async function notifyWizardDmBlocked(buttonInteraction) {
    await replyUserError(buttonInteraction, {
        type: ErrorTypes.USER_INPUT,
        message: `Je n'ai pas pu vous envoyer de message privé. Activez les messages privés de ce serveur, puis réessayez.\n\n${DM_DISABLED_HELP}`,
    }).catch(() => {});
}

function formatChannelMention(guild, channelId) {
    if (!channelId) {
        return '`Non configuré`';
    }

    const channel = guild.channels.cache.get(channelId);
    return channel ? `<#${channelId}>` : `#${channelId}`;
}

function formatRoleMention(guild, roleId) {
    if (!roleId) {
        return '`Non configuré`';
    }

    const role = guild.roles.cache.get(roleId);
    return role ? `<@&${roleId}>` : `@${roleId}`;
}

function getBotPresenceText() {
    const activity = botConfig.presence?.activities?.[0];

    if (!activity?.name) {
        return '`Non configuré`';
    }

    const typeLabels = [
        'Joue à',
        'Diffuse',
        'Écoute',
        'Regarde',
        '',
        'Participe à',
    ];

    const typeLabel = typeLabels[activity.type];

    if (!typeLabel) {
        return activity.name;
    }

    return `${typeLabel} **${activity.name}**`;
}

function getThemeColorLines() {
    const colors = botConfig.embeds.colors;

    return [
        `🎨 Principale \`${colors.primary}\` · Succès \`${colors.success}\``,
        `⚠️ Avertissement \`${colors.warning}\` · Erreur \`${colors.error}\``,
    ].join('\n');
}

function buildDashboardEmbed(config, guild) {
    const setupDone = config.setupWizardCompleted;

    return createEmbed({
        title: '⚙️ Configuration du serveur',
        description: `Paramètres principaux de **${guild.name}**. Sélectionnez une option ci-dessous ou lancez l'assistant de configuration.`,
        color: 'info',
        fields: [
            {
                name: '⌨️ Préfixe du serveur',
                value: `\`${config.prefix || getCommandPrefix()}\``,
                inline: true,
            },
            {
                name: '🛡️ Rôle des modérateurs',
                value: formatRoleMention(guild, config.modRole),
                inline: true,
            },
            {
                name: '📋 Salon des journaux',
                value: formatChannelMention(guild, config.logging?.channels?.audit),
                inline: true,
            },
            {
                name: '💚 Statut du bot',
                value: getBotPresenceText(),
                inline: false,
            },
            {
                name: '🎨 Thème des embeds',
                value: `${getThemeColorLines()}\n-# Les couleurs sont définies dans la configuration du bot et s'appliquent globalement.`,
                inline: false,
            },
            {
                name: '⚡ Accès aux commandes',
                value: 'Utilisez `/commands dashboard` pour activer ou désactiver les commandes et les sous-commandes.',
                inline: false,
            },
            {
                name: `${setupDone ? '✅' : '📝'} Configuration`,
                value: setupDone
                    ? 'Assistant de configuration terminé — vous pouvez le relancer à tout moment pour modifier les paramètres.'
                    : 'Lancez l\'assistant de configuration pour configurer rapidement votre serveur.',
                inline: false,
            },
        ],
        footer: 'Le tableau de bord se ferme après 10 minutes d\'inactivité',
    });
}

function buildSettingsSelect(guildId) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${DASHBOARD_CUSTOM_ID}:${guildId}`)
            .setPlaceholder('⚙️ Sélectionnez un paramètre à modifier...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Préfixe du serveur')
                    .setDescription('Modifier le préfixe des commandes texte')
                    .setValue('prefix')
                    .setEmoji('⌨️'),

                new StringSelectMenuOptionBuilder()
                    .setLabel('Rôle des modérateurs')
                    .setDescription('Rôle utilisé pour les commandes de modération')
                    .setValue('modRole')
                    .setEmoji('🛡️'),

                new StringSelectMenuOptionBuilder()
                    .setLabel('Salon des journaux')
                    .setDescription('Salon utilisé pour les messages de journalisation du système')
                    .setValue('logChannelId')
                    .setEmoji('📋'),
            ),
    );
}

function buildButtonRow(config, guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${WIZARD_BUTTON_ID}:${guildId}`)
            .setLabel(
                config.setupWizardCompleted
                    ? 'Relancer l\'assistant de configuration'
                    : 'Démarrer l\'assistant de configuration',
            )
            .setEmoji('📝')
            .setStyle(
                config.setupWizardCompleted
                    ? ButtonStyle.Secondary
                    : ButtonStyle.Success,
            ),
    );
}

function extractId(value) {
    if (!value || typeof value !== 'string') return null;

    const channelMention = value.match(/<#!?(\d{17,19})>/);
    if (channelMention) return channelMention[1];

    const roleMention = value.match(/<@&(\d{17,19})>/);
    if (roleMention) return roleMention[1];

    const digits = value.match(/^(\d{17,19})$/);
    if (digits) return digits[1];

    return null;
}

async function askQuestion(dmChannel, userId, prompt, stepNumber, totalSteps) {
    await dmChannel.send({
        embeds: [createEmbed({
            title: `Question de configuration ${stepNumber}/${totalSteps}`,
            description: prompt,
            color: 'primary',
        })],
    });

    const collected = await dmChannel.awaitMessages({
        filter: (message) =>
            message.author.id === userId &&
            !message.author.bot,
        max: 1,
        time: 180_000,
    }).catch(() => null);

    if (!collected || !collected.size) {
        await dmChannel.send({
            embeds: [
                buildUserErrorEmbed(
                    ErrorTypes.RATE_LIMIT,
                    'Vous n\'avez pas répondu à temps. Relancez l\'assistant de configuration lorsque vous êtes prêt.',
                ),
            ],
        });

        return null;
    }

    const answer = collected.first().content.trim();

    if (answer.toLowerCase() === 'cancel') {
        await dmChannel.send({
            embeds: [
                infoEmbed(
                    'Configuration annulée',
                    'L\'assistant de configuration a été arrêté. Vos réponses déjà enregistrées ont été conservées.',
                ),
            ],
        });

        return { cancelled: true };
    }

    return { answer };
}

function formatSavedAck(key, value, guild) {
    if (key === 'prefix') {
        return `Le préfixe du serveur a été enregistré comme \`${value}\`.`;
    }

    if (key === 'logChannelId') {
        if (value === null) {
            return 'Le salon des journaux a été supprimé.';
        }

        const channel = guild.channels.cache.get(value);
        return `Le salon des journaux a été défini sur ${channel ?? `<#${value}>`}.`;
    }

    if (key === 'modRole') {
        if (value === null) {
            return 'Le rôle des modérateurs a été supprimé.';
        }

        const role = guild.roles.cache.get(value);
        return `Le rôle des modérateurs a été défini sur ${role ?? `<@&${value}>`}.`;
    }

    return 'Paramètre enregistré.';
}

async function validateGuildChannelId(guild, channelId) {
    const channel =
        guild.channels.cache.get(channelId) ??
        await guild.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) {
        throw new Error(
            'Ce salon est introuvable sur ce serveur ou n\'est pas un salon textuel.',
        );
    }

    return channel.id;
}

async function validateGuildRoleId(guild, roleId) {
    const role =
        guild.roles.cache.get(roleId) ??
        await guild.roles.fetch(roleId).catch(() => null);

    if (!role) {
        throw new Error(
            'Ce rôle est introuvable sur ce serveur.',
        );
    }

    return role.id;
}

async function refreshDashboard(rootInteraction, config, guild) {
    const embed = buildDashboardEmbed(config, guild);

    const components = [
        buildButtonRow(config, guild.id),
        buildSettingsSelect(guild.id),
    ];

    await InteractionHelper.safeEditReply(
        rootInteraction,
        {
            embeds: [embed],
            components,
        },
    ).catch(() => {});
}

async function runSetupWizard(
    buttonInteraction,
    config,
    guild,
    client,
    rootInteraction,
) {
    const user = buttonInteraction.user;

    if (activeWizardSessions.has(user.id)) {
        await buttonInteraction.followUp({
            embeds: [
                warningEmbed(
                    'Configuration déjà en cours',
                    'Vous avez déjà un assistant de configuration ouvert dans vos messages privés. Répondez-y pour continuer ou tapez `cancel` pour l\'arrêter.',
                ),
            ],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});

        return;
    }

    activeWizardSessions.add(user.id);

    let dmChannel;

    try {
        dmChannel = await user.createDM();
    } catch (error) {
        logger.warn(
            'Impossible de créer le salon de messages privés pour l\'assistant de configuration',
            {
                userId: user.id,
                error: error.message,
            },
        );

        await notifyWizardDmBlocked(buttonInteraction);
        return;
    } finally {
        if (!dmChannel) {
            activeWizardSessions.delete(user.id);
        }
    }

    const prompts = [
        {
            key: 'prefix',

            skipMessage:
                'Le préfixe actuel du serveur sera conservé.',

            question:
                'Quel préfixe de commande ce serveur doit-il utiliser ?\nActuel : `' +
                (config.prefix || getCommandPrefix()) +
                '`\nRépondez `skip` pour le conserver ou `cancel` pour arrêter.',

            parse: async (answer) => {
                const normalized = answer.trim();

                if (normalized.toLowerCase() === 'skip') {
                    return undefined;
                }

                if (
                    /\s/.test(normalized) ||
                    normalized.length < 1 ||
                    normalized.length > 10
                ) {
                    throw new Error(
                        'Le préfixe doit contenir entre 1 et 10 caractères et ne doit pas contenir d\'espaces.',
                    );
                }

                return normalized;
            },
        },

        {
            key: 'logChannelId',

            skipMessage:
                'Le salon des journaux actuel sera conservé.',

            question:
                'Quel salon doit recevoir les journaux du bot ?\nEnvoyez une mention du salon, son ID, `none` pour le supprimer, `skip` pour conserver la valeur actuelle ou `cancel` pour arrêter.',

            parse: async (answer) => {
                const normalized = answer.trim();

                if (normalized.toLowerCase() === 'skip') {
                    return undefined;
                }

                if (normalized.toLowerCase() === 'none') {
                    return null;
                }

                const id = extractId(normalized);

                if (!id) {
                    throw new Error(
                        'Veuillez fournir une mention de salon ou un ID valide provenant de ce serveur.',
                    );
                }

                return validateGuildChannelId(guild, id);
            },
        },

        {
            key: 'modRole',

            skipMessage:
                'Le rôle actuel des modérateurs sera conservé.',

            question:
                'Quel rôle les modérateurs doivent-ils avoir ?\nEnvoyez une mention du rôle, son ID, `none` pour le supprimer, `skip` pour conserver la valeur actuelle ou `cancel` pour arrêter.',

            parse: async (answer) => {
                const normalized = answer.trim();

                if (normalized.toLowerCase() === 'skip') {
                    return undefined;
                }

                if (normalized.toLowerCase() === 'none') {
                    return null;
                }

                const id = extractId(normalized);

                if (!id) {
                    throw new Error(
                        'Veuillez fournir une mention de rôle ou un ID valide provenant de ce serveur.',
                    );
                }

                return validateGuildRoleId(guild, id);
            },
        },
    ];

    const changes = {};
    const errors = [];
    let wizardCancelled = false;

    try {
        try {
            await dmChannel.send({
                embeds: [
                    createEmbed({
                        title: '📝 Assistant de configuration',
                        description:
                            'Répondez à chaque question dans ce message privé.\n\n' +
                            '• Tapez `skip` pour conserver la valeur actuelle\n' +
                            '• Tapez `cancel` pour arrêter l\'assistant',
                        color: 'info',
                    }),
                ],
            });
        } catch (error) {
            logger.warn(
                'Impossible d\'envoyer le message privé de l\'assistant de configuration',
                {
                    userId: user.id,
                    error: error.message,
                },
            );

            await notifyWizardDmBlocked(buttonInteraction);
            return;
        }

        await notifyWizardStarted(buttonInteraction);

        for (
            let index = 0;
            index < prompts.length;
            index++
        ) {
            const prompt = prompts[index];
            let answered = false;

            while (!answered) {
                const result = await askQuestion(
                    dmChannel,
                    user.id,
                    prompt.question,
                    index + 1,
                    prompts.length,
                );

                if (result === null) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                if (result.cancelled) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                try {
                    const value =
                        await prompt.parse(result.answer);

                    if (value === undefined) {
                        await dmChannel.send({
                            embeds: [
                                infoEmbed(
                                    'Paramètre ignoré',
                                    prompt.skipMessage,
                                ),
                            ],
                        });
                    } else {
                        await ConfigService.updateSetting(
                            client,
                            guild.id,
                            prompt.key,
                            value,
                            user.id,
                        );

                        changes[prompt.key] = value;

                        await dmChannel.send({
                            embeds: [
                                successEmbed(
                                    'Enregistré',
                                    formatSavedAck(
                                        prompt.key,
                                        value,
                                        guild,
                                    ),
                                ),
                            ],
                        });

                        try {
                            const updatedConfig =
                                await getGuildConfig(
                                    client,
                                    guild.id,
                                );

                            await refreshDashboard(
                                rootInteraction,
                                updatedConfig,
                                guild,
                            );
                        } catch (refreshError) {
                            logger.debug(
                                'Impossible de rafraîchir le tableau de bord pendant l\'assistant de configuration',
                                {
                                    error:
                                        refreshError.message,
                                },
                            );
                        }
                    }

                    answered = true;
                } catch (error) {
                    errors.push(
                        `• ${prompt.key}: ${error.message}`,
                    );

                    await dmChannel.send({
                        embeds: [
                            buildUserErrorEmbed(
                                ErrorTypes.VALIDATION,
                                `${error.message}\n\nVeuillez répondre à nouveau avec une valeur valide, \`skip\` ou \`cancel\`.`,
                            ),
                        ],
                    });
                }
            }

            if (wizardCancelled) {
                break;
            }
        }

        if (!wizardCancelled) {
            try {
                await setConfigValue(
                    client,
                    guild.id,
                    'setupWizardCompleted',
                    true,
                );
            } catch (error) {
                logger.warn(
                    'Impossible d\'enregistrer le statut de configuration terminée',
                    {
                        guildId: guild.id,
                        error: error.message,
                    },
                );
            }
        }

        const summaryTitle = wizardCancelled
            ? (
                Object.keys(changes).length > 0
                    ? 'Configuration arrêtée'
                    : 'Configuration annulée'
            )
            : 'Configuration terminée';

        const summaryBody = wizardCancelled
            ? (
                Object.keys(changes).length > 0
                    ? `La configuration a été arrêtée prématurément. **${Object.keys(changes).length}** paramètre(s) ont été enregistrés avant l'arrêt.`
                    : 'L\'assistant de configuration a été arrêté avant qu\'aucune modification ne soit enregistrée.'
            )
            : (
                Object.keys(changes).length > 0
                    ? `**${Object.keys(changes).length}** paramètre(s) ont été mis à jour.${errors.length > 0 ? ' Certaines réponses ont nécessité plusieurs tentatives.' : ''}`
                    : 'Aucune modification n\'a été appliquée.'
            );

        const summaryEmbed = createEmbed({
            title: wizardCancelled
                ? `⚠️ ${summaryTitle}`
                : `✅ ${summaryTitle}`,

            description: summaryBody,

            color: wizardCancelled
                ? 'warning'
                : (
                    errors.length > 0
                        ? 'warning'
                        : 'success'
                ),
        });

        if (errors.length > 0) {
            const uniqueErrors = [
                ...new Set(errors),
            ];

            summaryEmbed.addFields({
                name: 'Problèmes rencontrés',
                value: uniqueErrors
                    .join('\n')
                    .slice(0, 1024),
            });
        }

        await dmChannel.send({
            embeds: [summaryEmbed],
        });

        try {
            const updatedConfig =
                await getGuildConfig(
                    client,
                    guild.id,
                );

            await refreshDashboard(
                rootInteraction,
                updatedConfig,
                guild,
            );
        } catch (error) {
            logger.debug(
                'Impossible de rafraîchir le tableau de bord après la fin de l\'assistant',
                {
                    error: error.message,
                },
            );
        }
    } finally {
        activeWizardSessions.delete(user.id);
    }
}

async function showSettingModal(
    selectInteraction,
    guildId,
    setting,
) {
    const modalCustomId =
        `config_wizard_modal:${setting}:${guildId}`;

    if (setting === 'logChannelId') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('📋 Modifier le salon des journaux');

        const channelSelect =
            new ChannelSelectMenuBuilder()
                .setCustomId('log_channel')
                .setPlaceholder(
                    'Sélectionnez un salon textuel...',
                )
                .setMinValues(1)
                .setMaxValues(1)
                .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement,
                )
                .setRequired(true);

        const channelLabel =
            new LabelBuilder()
                .setLabel('Salon des journaux')
                .setDescription(
                    'Salon où les messages de journalisation du système seront envoyés',
                )
                .setChannelSelectMenuComponent(
                    channelSelect,
                );

        modal.addLabelComponents(channelLabel);

        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'modRole') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('🛡️ Modifier le rôle des modérateurs');

        const roleSelect =
            new RoleSelectMenuBuilder()
                .setCustomId('mod_role')
                .setPlaceholder(
                    'Sélectionnez un rôle de modérateur...',
                )
                .setMinValues(1)
                .setMaxValues(1)
                .setRequired(true);

        const roleLabel =
            new LabelBuilder()
                .setLabel('Rôle des modérateurs')
                .setDescription(
                    'Rôle utilisé pour les commandes de modération',
                )
                .setRoleSelectMenuComponent(
                    roleSelect,
                );

        modal.addLabelComponents(roleLabel);

        await selectInteraction.showModal(modal);
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle('Modifier le préfixe du serveur');

    const textInput = new TextInputBuilder()
        .setCustomId('value')
        .setLabel(
            'Nouveau préfixe (1 à 10 caractères, sans espaces)',
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            textInput,
        ),
    );

    await selectInteraction.showModal(modal);
}

function resolveSettingModalValue(
    setting,
    submitted,
) {
    if (setting === 'logChannelId') {
        const channelId =
            submitted.fields.getField(
                'log_channel',
            )?.values?.[0];

        if (!channelId) {
            throw new Error(
                'Veuillez sélectionner un salon de journaux.',
            );
        }

        return channelId;
    }

    if (setting === 'modRole') {
        const roleId =
            submitted.fields.getField(
                'mod_role',
            )?.values?.[0];

        if (!roleId) {
            throw new Error(
                'Veuillez sélectionner un rôle de modérateur.',
            );
        }

        return roleId;
    }

    const prefix =
        submitted.fields
            .getTextInputValue('value')
            ?.trim();

    if (
        !prefix ||
        prefix.length < 1 ||
        prefix.length > 10 ||
        /\s/.test(prefix)
    ) {
        throw new Error(
            'Le préfixe doit contenir entre 1 et 10 caractères et ne doit pas contenir d\'espaces.',
        );
    }

    return prefix;
}

function buildSettingSuccessMessage(
    setting,
    value,
    guild,
) {
    if (setting === 'logChannelId') {
        const channel =
            guild.channels.cache.get(value);

        return `Le salon des journaux a été défini sur ${channel ?? `<#${value}>`}.`;
    }

    if (setting === 'modRole') {
        const role =
            guild.roles.cache.get(value);

        return `Le rôle des modérateurs a été défini sur ${role ?? `<@&${value}>`}.`;
    }

    return `Le préfixe du serveur a été défini sur \`${value}\`.`;
}

async function handleSettingModalSubmit(
    selectInteraction,
    rootInteraction,
    setting,
    guildId,
    client,
) {
    const modalCustomId =
        `config_wizard_modal:${setting}:${guildId}`;

    const submitted =
        await selectInteraction
            .awaitModalSubmit({
                filter: (modalInteraction) =>
                    modalInteraction.customId ===
                        modalCustomId &&
                    modalInteraction.user.id ===
                        selectInteraction.user.id,

                time: 120_000,
            })
            .catch(() => null);

    if (!submitted) {
        return;
    }

    try {
        const value =
            resolveSettingModalValue(
                setting,
                submitted,
            );

        await ConfigService.updateSetting(
            client,
            guildId,
            setting,
            value,
            submitted.user.id,
        );

        await submitted.reply({
            embeds: [
                successEmbed(
                    'Configuration mise à jour',
                    buildSettingSuccessMessage(
                        setting,
                        value,
                        submitted.guild,
                    ),
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        const updatedConfig =
            await getGuildConfig(
                client,
                guildId,
            );

        await refreshDashboard(
            rootInteraction,
            updatedConfig,
            submitted.guild,
        );
    } catch (error) {
        logger.error(
            'Erreur lors de la soumission du formulaire de configuration :',
            error,
        );

        await replyUserError(
            submitted,
            {
                type: ErrorTypes.CONFIGURATION,
                message:
                    error.message ||
                    'Veuillez réessayer.',
            },
        ).catch(() => {});
    }
}

export default {
    slashOnly: true,

    data: new SlashCommandBuilder()
        .setName('configwizard')
        .setDescription(
            'Ouvrir le tableau de bord de configuration du serveur et l\'assistant de configuration',
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild,
        )
        .setDMPermission(false),

    category: 'Core',

    async execute(interaction) {
        try {
            const deferSuccess =
                await InteractionHelper.safeDefer(
                    interaction,
                    {
                        flags: MessageFlags.Ephemeral,
                    },
                );

            if (!deferSuccess) {
                return;
            }

            if (
                !interaction.memberPermissions?.has(
                    PermissionFlagsBits.ManageGuild,
                )
            ) {
                return replyUserError(
                    interaction,
                    {
                        type: ErrorTypes.PERMISSION,
                        message:
                            'Vous devez avoir la permission **Gérer le serveur** pour utiliser cette commande.',
                    },
                );
            }

            const guildConfig =
                await getGuildConfig(
                    interaction.client,
                    interaction.guildId,
                );

            const embed =
                buildDashboardEmbed(
                    guildConfig,
                    interaction.guild,
                );

            const components = [
                buildButtonRow(
                    guildConfig,
                    interaction.guildId,
                ),
                buildSettingsSelect(
                    interaction.guildId,
                ),
            ];

            await InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [embed],
                    components,
                },
            );

            const replyMessage =
                await interaction
                    .fetchReply()
                    .catch(() => null);

            if (!replyMessage) {
                return;
            }

            const collectorFilter =
                (componentInteraction) =>
                    componentInteraction.user.id ===
                        interaction.user.id &&
                    componentInteraction.customId.includes(
                        `:${interaction.guildId}`,
                    );

            const componentCollector =
                replyMessage.createMessageComponentCollector({
                    filter: collectorFilter,
                    time: 600_000,
                });

            componentCollector.on(
                'collect',
                async (componentInteraction) => {
                    try {
                        if (
                            componentInteraction.isButton()
                        ) {
                            await componentInteraction.deferUpdate();

                            if (
                                componentInteraction.customId.startsWith(
                                    `${WIZARD_BUTTON_ID}:`,
                                )
                            ) {
                                const latestConfig =
                                    await getGuildConfig(
                                        interaction.client,
                                        interaction.guildId,
                                    );

                                await runSetupWizard(
                                    componentInteraction,
                                    latestConfig,
                                    interaction.guild,
                                    interaction.client,
                                    interaction,
                                );
                            }

                            return;
                        }

                        if (
                            componentInteraction.isStringSelectMenu()
                        ) {
                            const selected =
                                componentInteraction.values[0];

                            await showSettingModal(
                                componentInteraction,
                                interaction.guildId,
                                selected,
                            );

                            await handleSettingModalSubmit(
                                componentInteraction,
                                interaction,
                                selected,
                                interaction.guildId,
                                interaction.client,
                            );
                        }
                    } catch (error) {
                        logger.error(
                            'Erreur lors de l\'interaction avec le tableau de bord de configuration :',
                            error,
                        );

                        await replyUserError(
                            componentInteraction,
                            {
                                type: ErrorTypes.UNKNOWN,
                                message:
                                    'Impossible de traiter votre sélection. Veuillez réessayer.',
                            },
                        ).catch(() => {});
                    }
                },
            );
        } catch (error) {
            logger.error(
                'Erreur de la commande de configuration :',
                error,
            );

            await replyUserError(
                interaction,
                {
                    type: ErrorTypes.CONFIGURATION,
                    message:
                        'Impossible d\'ouvrir le tableau de bord de configuration. Veuillez réessayer.',
                },
            );
        }
    },
};

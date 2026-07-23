import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getLevelingConfig, saveLevelingConfig } from '../../services/leveling/leveling.js';
import { botHasPermission } from '../../utils/permissionGuard.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import levelDashboard from './modules/level_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('niveau')
        .setDescription('Gérer le système de niveaux')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('configuration')
                .setDescription('Configurer le système de niveaux — cela l’active également')
                .addChannelOption((option) =>
                    option
                        .setName('salon')
                        .setDescription('Salon où envoyer les notifications de montée de niveau')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_min')
                        .setDescription('XP minimum gagné par message (par défaut : 15)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_max')
                        .setDescription('XP maximum gagné par message (par défaut : 25)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('message')
                        .setDescription(
                            'Message de montée de niveau. Utilisez {user} et {level} (message par défaut fourni)',
                        )
                        .setMaxLength(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('delai_xp')
                        .setDescription('Secondes entre chaque gain d’XP par utilisateur (par défaut : 60)')
                        .setMinValue(0)
                        .setMaxValue(3600)
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('tableau')
                .setDescription('Ouvrir le tableau de configuration interactif du système de niveaux'),
        ),
    category: 'Leveling',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'Vous devez avoir la permission **Gérer le serveur** pour utiliser cette commande.',
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'tableau') {
            return levelDashboard.execute(interaction, config, client);
        }

        if (subcommand === 'configuration') {
            const channel = interaction.options.getChannel('salon');
            const xpMin = interaction.options.getInteger('xp_min') ?? 15;
            const xpMax = interaction.options.getInteger('xp_max') ?? 25;
            const message =
                interaction.options.getString('message') ??
                '{user} est passé au niveau {level} !';
            const xpCooldown = interaction.options.getInteger('delai_xp') ?? 60;

            if (xpMin > xpMax) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: `L’XP minimum (**${xpMin}**) ne peut pas être supérieure à l’XP maximum (**${xpMax}**).`,
                });
            }

            if (!botHasPermission(channel, ['SendMessages', 'EmbedLinks'])) {
                throw new TitanBotError(
                    'Bot missing permissions in the specified channel',
                    ErrorTypes.PERMISSION,
                    `J’ai besoin des permissions **Envoyer des messages** et **Intégrer des liens** dans ${channel} pour envoyer les notifications de montée de niveau.`,
                );
            }

            const existingConfig = await getLevelingConfig(client, interaction.guildId);

            if (existingConfig.configured) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: `Le système de niveaux est déjà configuré sur ce serveur (les notifications de montée de niveau sont envoyées dans <#${existingConfig.levelUpChannel}>).\n\nUtilisez \`/niveau tableau\` pour modifier les paramètres.`,
                });
            }

            const newConfig = {
                ...existingConfig,
                configured: true,
                enabled: true,
                levelUpChannel: channel.id,
                xpRange: { min: xpMin, max: xpMax },
                xpCooldown: xpCooldown,
                levelUpMessage: message,
                announceLevelUp: true,
            };

            await saveLevelingConfig(client, interaction.guildId, newConfig);

            logger.info(`Leveling system set up in guild ${interaction.guildId}`, {
                channelId: channel.id,
                xpMin,
                xpMax,
                xpCooldown,
                userId: interaction.user.id,
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: 'Système de niveaux configuré',
                        description:
                            `Le système de niveaux est maintenant **activé** et prêt à fonctionner.\n\n` +
                            `**Salon des montées de niveau :** ${channel}\n` +
                            `**XP par message :** ${xpMin} – ${xpMax}\n` +
                            `**Délai entre les gains d’XP :** ${xpCooldown}s\n` +
                            `**Message de montée de niveau :** \`${message}\`\n\n` +
                            `Utilisez \`/niveau tableau\` pour modifier ces paramètres à tout moment.`,
                        color: 'success',
                    }),
                ],
            });
        }
    },
};

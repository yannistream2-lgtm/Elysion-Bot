import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  getCountingGameConfig,
  activateCountingGame,
  disableCountingGame,
  resetCountingGame,
  buildCountingLeaderboard,
  getCountingSystemChoices,
  getCountingSystemLabel,
  getExpectedCountValue,
} from '../../services/countingGameService.js';
import { logger } from '../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('count')
    .setDescription('Gérer le jeu de comptage du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)

    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Démarrer un jeu de comptage dans un salon textuel')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Le salon dans lequel le comptage aura lieu')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName('system')
            .setDescription('Le système de comptage à utiliser')
            .setRequired(true)
            .addChoices(...getCountingSystemChoices()),
        ),
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Désactiver le jeu de comptage sur ce serveur'),
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Voir le statut actuel du jeu de comptage'),
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Réinitialiser la séquence de comptage actuelle')
        .addIntegerOption((option) =>
          option
            .setName('start')
            .setDescription('Le nombre auquel recommencer après la réinitialisation')
            .setMinValue(1),
        ),
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('leaderboard')
        .setDescription('Afficher le classement du jeu de comptage'),
    ),

  category: 'Fun',

  async execute(interaction) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, {
        flags: MessageFlags.Ephemeral,
      });

      if (!deferSuccess) {
        logger.warn('Échec du defer de la commande count', {
          userId: interaction.user.id,
          guildId: interaction.guildId,
        });
        return;
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message: 'Vous devez avoir la permission **Gérer le serveur** pour utiliser cette commande.',
        });
      }

      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();
      const config = await getCountingGameConfig(
        interaction.client,
        guildId,
      );

      // Configuration du jeu de comptage
      if (subcommand === 'setup') {
        const channel = interaction.options.getChannel('channel');
        const system = interaction.options.getString('system');

        if (!channel || channel.type !== ChannelType.GuildText) {
          return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'Veuillez choisir un salon textuel pour le jeu de comptage.',
          });
        }

        if (
          config.enabled &&
          config.channelId &&
          config.channelId !== channel.id
        ) {
          return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: `Ce serveur possède déjà un salon de comptage actif configuré : <#${config.channelId}>. Désactivez d'abord le jeu de comptage actuel ou utilisez le salon existant.`,
          });
        }

        await activateCountingGame(
          interaction.client,
          guildId,
          channel.id,
          system,
        );

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Jeu de comptage activé',
              `Le jeu de comptage est maintenant actif dans ${channel} avec le système **${getCountingSystemLabel(system)}**. Les joueurs doivent compter à partir de **1** et ne peuvent pas envoyer deux nombres consécutifs.`,
            ),
          ],
        });
      }

      // Désactivation du jeu
      if (subcommand === 'disable') {
        if (!config.enabled) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
              infoEmbed(
                'Jeu de comptage désactivé',
                'Le jeu de comptage est déjà désactivé sur ce serveur.',
              ),
            ],
          });
        }

        await disableCountingGame(
          interaction.client,
          guildId,
        );

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Jeu de comptage désactivé',
              'Le jeu de comptage a été désactivé.',
            ),
          ],
        });
      }

      // Statut du jeu
      if (subcommand === 'status') {
        const fields = [
          {
            name: 'Activé',
            value: config.enabled ? 'Oui' : 'Non',
            inline: true,
          },
          {
            name: 'Salon',
            value: config.channelId
              ? `<#${config.channelId}>`
              : 'Non configuré',
            inline: true,
          },
          {
            name: 'Système',
            value: getCountingSystemLabel(config.system),
            inline: true,
          },
          {
            name: 'Prochain nombre',
            value: getExpectedCountValue(config),
            inline: true,
          },
          {
            name: 'Série actuelle',
            value: `${config.currentStreak}`,
            inline: true,
          },
          {
            name: 'Meilleure série',
            value: `${config.bestStreak || 0}`,
            inline: true,
          },
          {
            name: 'Dernier compteur',
            value: config.lastUserId
              ? `<@${config.lastUserId}>`
              : 'Aucun',
            inline: true,
          },
        ];

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Statut du jeu de comptage',
              description: 'Aperçu du jeu de comptage actuellement configuré.',
              fields,
              color: 'primary',
            }),
          ],
        });
      }

      // Réinitialisation du compteur
      if (subcommand === 'reset') {
        if (!config.enabled) {
          return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Activez d’abord le jeu de comptage avec `/count setup`.',
          });
        }

        const startNumber =
          interaction.options.getInteger('start') || 1;

        await resetCountingGame(
          interaction.client,
          guildId,
          startNumber,
        );

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Jeu de comptage réinitialisé',
              `La séquence de comptage a été réinitialisée. Recommencez avec **${startNumber}** dans <#${config.channelId}>.`,
            ),
          ],
        });
      }

      // Classement
      if (subcommand === 'leaderboard') {
        const leaderboard = buildCountingLeaderboard(
          config,
          interaction.guild,
        );

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Classement du jeu de comptage',
              description:
                leaderboard.length > 0
                  ? leaderboard.join('\n')
                  : 'Aucun comptage n’a encore été enregistré.',
              color: 'primary',
            }),
          ],
        });
      }

      return await replyUserError(interaction, {
        type: ErrorTypes.VALIDATION,
        message: 'Veuillez choisir une action valide pour le jeu de comptage.',
      });

    } catch (error) {
      logger.error('Erreur de la commande count :', error);

      return await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Une erreur est survenue lors de la gestion du jeu de comptage.',
      });
    }
  },
};

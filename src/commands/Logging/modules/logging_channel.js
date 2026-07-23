import { PermissionsBitField, ChannelType } from 'discord.js';
import { setLogChannel } from '../../../services/loggingService.js';
import { successEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

const DESTINATION_LABELS = {
  audit: 'Journal d’audit',
  applications: 'Candidatures',
  reports: 'Signalements',
};

export default {
  prefixOnly: false,

  async execute(interaction, config, client) {
    try {
      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.ManageGuild,
        )
      ) {
        return await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message:
            'Vous devez avoir la permission **Gérer le serveur** pour configurer les salons de logs.',
        });
      }

      await InteractionHelper.safeDefer(
        interaction,
        {
          ephemeral: true,
        },
      );

      const destination =
        interaction.options.getString('destination');

      const channel =
        interaction.options.getChannel('channel');

      const disable =
        interaction.options.getBoolean('disable') ?? false;

      // Désactiver et supprimer le salon de logs
      if (disable) {
        await setLogChannel(
          client,
          interaction.guildId,
          destination,
          null,
        );

        return InteractionHelper.safeEditReply(
          interaction,
          {
            embeds: [
              successEmbed(
                'Salon supprimé',
                `Le salon **${DESTINATION_LABELS[destination]}** a été supprimé.`,
              ),
            ],
          },
        );
      }

      // Vérifier que le salon est valide
      if (
        !channel ||
        channel.type !== ChannelType.GuildText
      ) {
        return await replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message:
            'Veuillez fournir un salon textuel valide.',
        });
      }

      // Vérifier les permissions du bot
      const botPerms =
        channel.permissionsFor(
          interaction.guild.members.me,
        );

      if (
        !botPerms?.has([
          'ViewChannel',
          'SendMessages',
          'EmbedLinks',
        ])
      ) {
        return await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message:
            `J’ai besoin des permissions **Voir le salon**, **Envoyer des messages** et **Intégrer des liens** dans ${channel}.`,
        });
      }

      // Enregistrer le salon de logs
      await setLogChannel(
        client,
        interaction.guildId,
        destination,
        channel.id,
      );

      return InteractionHelper.safeEditReply(
        interaction,
        {
          embeds: [
            successEmbed(
              'Salon mis à jour',
              `Les logs **${DESTINATION_LABELS[destination]}** seront désormais envoyés dans ${channel}.\nUtilisez \`/logging dashboard\` pour activer ou désactiver les catégories d’événements.`,
            ),
          ],
        },
      );
    } catch (error) {
      logger.error(
        'Erreur logging_channel :',
        error,
      );

      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message:
          'Impossible de mettre à jour le salon de logs.',
      });
    }
  },
};

import { createEmbed, successEmbed } from '../utils/embeds.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import {
    getEconomyKey,
    getUserLevelKey,
    getAFKKey,
    getWarningsKey,
    getUserNotesKey,
    getEconomyPrefix,
    getUserLevelPrefix,
} from '../utils/database.js';

const wipedataConfirmHandler = {
  name: 'wipedata_yes',
  async execute(interaction, client) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const userId = interaction.user.id;
      const guildId = interaction.guildId;

      const dataKeyPatterns = [
        getEconomyKey(guildId, userId),
        getUserLevelKey(guildId, userId),
        getAFKKey(guildId, userId),
        getWarningsKey(guildId, userId),
        getUserNotesKey(guildId, userId),
        `level:${guildId}:${userId}`,
        `xp:${guildId}:${userId}`,
        `inventory:${guildId}:${userId}`,
        `bank:${guildId}:${userId}`,
        `wallet:${guildId}:${userId}`,
        `cooldowns:${guildId}:${userId}`,
        `shop:${guildId}:${userId}`,
        `shop_data:${guildId}:${userId}`,
        `counter:${guildId}:${userId}`,
        `birthday:${guildId}:${userId}`,
        `balance:${guildId}:${userId}`,
        `user:${guildId}:${userId}`,
        `leveling:${guildId}:${userId}`,
        `crimexp:${guildId}:${userId}`,
        `robxp:${guildId}:${userId}`,
        `crime_cooldown:${guildId}:${userId}`,
        `rob_cooldown:${guildId}:${userId}`,
        `lastDaily:${guildId}:${userId}`,
        `lastWork:${guildId}:${userId}`,
        `lastCrime:${guildId}:${userId}`,
        `lastRob:${guildId}:${userId}`,
        `${guildId}:leveling:users:${userId}`,
      ];

      let deletedCount = 0;
      const deleteErrors = [];

      for (const key of dataKeyPatterns) {
        try {
          const exists = await client.db.exists(key);
          if (exists) {
            await client.db.delete(key);
            deletedCount++;
          }
        } catch (error) {
          logger.error(`Erreur lors de la suppression de la clé ${key} :`, error);
          deleteErrors.push(key);
        }
      }

      try {
        if (client.db.list && typeof client.db.list === 'function') {
          const searchPrefixes = [
            `${guildId}:${userId}`,
            `${guildId}:`,
            getEconomyPrefix(guildId),
            getUserLevelPrefix(guildId),
            `level:${guildId}:`,
            `xp:${guildId}:`,
            `user:${guildId}:`
          ];

          const discoveredKeys = new Set();

          for (const prefix of searchPrefixes) {
            try {
              const keys = await client.db.list(prefix);
              if (Array.isArray(keys)) {
                keys.forEach((key) => discoveredKeys.add(key));
              }
            } catch (listError) {
              logger.debug(`La recherche des clés a échoué pour le préfixe ${prefix} :`, listError);
            }
          }

          const additionalUserKeys = [...discoveredKeys].filter((key) => {
            if (dataKeyPatterns.includes(key)) return false;
            return typeof key === 'string' && key.includes(`${guildId}:${userId}`);
          });

          for (const key of additionalUserKeys) {
            try {
              await client.db.delete(key);
              deletedCount++;
            } catch (error) {
              logger.error(`Erreur lors de la suppression de la clé supplémentaire ${key} :`, error);
              deleteErrors.push(key);
            }
          }
        }
      } catch (error) {
        logger.warn('Impossible d\'effectuer la recherche par préfixe dans la base de données :', error);
      }

      const successMessage =
        `✅ **Vos données ont été supprimées avec succès !**\n\n` +
        `**Enregistrements supprimés :** ${deletedCount}\n\n` +
        `Votre compte a été réinitialisé aux valeurs par défaut. Vous pouvez maintenant repartir de zéro !\n\n` +
        `*Votre solde économique, vos niveaux, vos objets et toutes vos données personnelles ont été supprimés.*`;

      await interaction.editReply({
        embeds: [successEmbed('Suppression des données terminée', successMessage)],
        components: []
      });

      logger.info(
        `L'utilisateur ${interaction.user.tag} (${userId}) a supprimé ses données sur le serveur ${guildId} - ${deletedCount} enregistrement(s) supprimé(s)`
      );

      if (deleteErrors.length > 0) {
        logger.warn(
          `La suppression des données s'est terminée avec ${deleteErrors.length} erreur(s) de suppression pour l'utilisateur ${userId} sur le serveur ${guildId}`
        );
      }

    } catch (error) {
      logger.error('Erreur du gestionnaire du bouton de confirmation de suppression des données :', error);
      
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Une erreur est survenue lors de la suppression de vos données. Veuillez réessayer plus tard ou contacter le support.'
      });
    }
  }
};

const wipedataCancelHandler = {
  name: 'wipedata_no',
  async execute(interaction, client) {
    try {
      await interaction.update({
        embeds: [
          createEmbed({
            title: '❌ Suppression des données annulée',
            description: 'Vos données ont été conservées. Votre compte reste inchangé.',
            color: 'info'
          })
        ],
        components: []
      });

      logger.info(
        `L'utilisateur ${interaction.user.tag} (${interaction.user.id}) a annulé la suppression de ses données sur le serveur ${interaction.guildId}`
      );
    } catch (error) {
      logger.error('Erreur du gestionnaire du bouton d\'annulation de suppression des données :', error);
      
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Impossible d\'annuler la suppression des données.'
        });
      }
    }
  }
};

export { wipedataConfirmHandler, wipedataCancelHandler };

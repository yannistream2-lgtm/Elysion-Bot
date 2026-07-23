import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { WarningService } from '../services/moderation/warningService.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { logger } from '../utils/logger.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';

const warningDeleteSpecificHandler = {
  name: 'warning_delete_specific',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message: 'Seul le modérateur qui a consulté ces avertissements peut les supprimer.'
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`warning_delete_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Supprimer un avertissement');

      const warningNumberInput = new TextInputBuilder()
        .setCustomId('warning_number')
        .setLabel('Numéro de l\'avertissement (#1, #2, etc.)')
        .setPlaceholder('Entrez le numéro de l\'avertissement à supprimer')
        .setRequired(true)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(10);

      const actionRow = new ActionRowBuilder().addComponents(warningNumberInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Erreur du bouton de suppression d\'avertissement :', error);
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Impossible d\'ouvrir le formulaire de suppression de l\'avertissement.'
      });
    }
  }
};

const warningClearAllHandler = {
  name: 'warning_clear_all',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message: 'Seul le modérateur qui a consulté ces avertissements peut les supprimer.'
        });
      }

      const targetUser = await client.users.fetch(targetUserId).catch(() => null);
      const targetName = targetUser ? targetUser.username : 'cet utilisateur';

      const clearModal = new ModalBuilder()
        .setCustomId(`warning_clear_confirm_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Supprimer tous les avertissements')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('delete_confirmation')
              .setLabel('Tapez "DELETE" pour supprimer tous les avertissements')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('DELETE')
              .setMaxLength(6)
              .setMinLength(6)
              .setRequired(true)
          )
        );

      await interaction.showModal(clearModal);
    } catch (error) {
      logger.error('Erreur du bouton de suppression de tous les avertissements :', error);
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Impossible d\'ouvrir le formulaire de confirmation.'
      });
    }
  }
};

async function warningDeleteModalHandler(interaction, client) {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await replyUserError(interaction, {
        type: ErrorTypes.PERMISSION,
        message: 'Seul le modérateur d\'origine peut supprimer les avertissements.'
      });
    }

    const warningNumberInput = interaction.fields.getTextInputValue('warning_number');
    const warningNumber = parseInt(warningNumberInput.replace('#', '').trim(), 10);

    if (isNaN(warningNumber) || warningNumber < 1) {
      return await replyUserError(interaction, {
        type: ErrorTypes.VALIDATION,
        message: 'Veuillez entrer un numéro d\'avertissement valide (ex. : 1, 2, 3).'
      });
    }

    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    const guildId = interaction.guildId;
    const warnings = await WarningService.getWarnings(guildId, targetUserId);

    if (warningNumber > warnings.length) {
      return await replyUserError(interaction, {
        type: ErrorTypes.USER_INPUT,
        message: `L\'avertissement #${warningNumber} n\'existe pas. Cet utilisateur possède seulement ${warnings.length} avertissement(s).`
      });
    }

    const warningToDelete = warnings[warningNumber - 1];
    await WarningService.removeWarning(guildId, targetUserId, warningToDelete.id);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'l\'utilisateur';

    logger.info(
      `[MODÉRATION] Avertissement supprimé pour ${targetUserId} sur ${guildId} par ${interaction.user.id}`,
      {
        warningId: warningToDelete.id,
        reason: warningToDelete.reason,
        warningNumber
      }
    );

    await interaction.editReply({
      embeds: [
        successEmbed(
          '✅ Avertissement supprimé',
          `L\'avertissement #${warningNumber} de **${targetName}** a été supprimé.\n\n**Raison :** ${warningToDelete.reason.substring(0, 100)}`
        )
      ]
    });
  } catch (error) {
    logger.error('Erreur du gestionnaire de suppression d\'avertissement :', error);
    await replyUserError(interaction, {
      type: ErrorTypes.UNKNOWN,
      message: 'Impossible de supprimer l\'avertissement.'
    });
  }
}

async function warningClearConfirmModalHandler(interaction, client) {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await replyUserError(interaction, {
        type: ErrorTypes.PERMISSION,
        message: 'Seul le modérateur d\'origine peut supprimer les avertissements.'
      });
    }

    const confirmation = interaction.fields.getTextInputValue('delete_confirmation').trim();

    if (confirmation !== 'DELETE') {
      return await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Vous devez taper exactement "DELETE" pour confirmer la suppression de tous les avertissements.'
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;
    const { count } = await WarningService.clearWarnings(guildId, targetUserId);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'l\'utilisateur';

    logger.info(
      `[MODÉRATION] Tous les avertissements supprimés pour ${targetUserId} sur ${guildId} par ${interaction.user.id}`
    );

    await interaction.editReply({
      embeds: [
        successEmbed(
          '✅ Avertissements supprimés',
          `Tous les avertissements de **${targetName}** ont été supprimés. **${count}** avertissement(s) supprimé(s).`
        )
      ]
    });
  } catch (error) {
    logger.error('Erreur du gestionnaire de confirmation de suppression des avertissements :', error);

    if (!interaction.replied && !interaction.deferred) {
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Impossible de supprimer les avertissements.'
      });
    } else {
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Impossible de supprimer les avertissements.'
      });
    }
  }
}

export {
  warningDeleteSpecificHandler,
  warningClearAllHandler,
  warningDeleteModalHandler,
  warningClearConfirmModalHandler,
};

export default {
  name: 'warning_delete_modal',
  execute: warningDeleteModalHandler
};

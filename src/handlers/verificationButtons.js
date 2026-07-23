import { MessageFlags } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { verifyUser } from '../services/verificationService.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';

export async function handleVerificationButton(interaction, client) {
    try {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.guild) {
            return await replyUserError(interaction, { 
                type: ErrorTypes.UNKNOWN, 
                message: 'Ce bouton peut uniquement être utilisé sur un serveur.' 
            });
        }

        const guild = interaction.guild;
        const userId = interaction.user.id;

        logger.debug('Un utilisateur a cliqué sur le bouton de vérification', {
            guildId: guild.id,
            userId,
            userTag: interaction.user.tag
        });

        const result = await verifyUser(client, guild.id, userId, {
            source: 'button_click',
            moderatorId: null
        });

        if (result.status === 'already_verified') {
            return await replyUserError(interaction, { 
                type: ErrorTypes.VALIDATION, 
                message: 'Vous êtes déjà vérifié et avez accès à tous les salons du serveur.' 
            });
        }

        logger.info('Utilisateur vérifié via le bouton', {
            guildId: guild.id,
            userId,
            roleName: result.roleName
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                "✅ Vérification réussie !",
                `Vous avez été vérifié et avez reçu le rôle **${result.roleName}** !\n\nVous avez maintenant accès à tous les salons et fonctionnalités du serveur. Bienvenue ! 🎉`
            )],
        });

    } catch (error) {
        logger.error('Erreur dans le gestionnaire du bouton de vérification', {
            error: error.message,
            guildId: interaction.guild?.id,
            userId: interaction.user.id
        });

        await handleInteractionError(
            interaction,
            error,
            { command: 'verify_button', action: 'verification' }
        );
    }
}

export default {
    customId: "verify_user",
    execute: handleVerificationButton
};

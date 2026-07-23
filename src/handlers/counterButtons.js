import { MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../utils/embeds.js';
import { performDeletionByCounterId } from '../commands/ServerStats/modules/serverstats_delete.js';
import { logger } from '../utils/logger.js';
import {
    ErrorTypes,
    replyUserError,
    handleInteractionError
} from '../utils/errorHandler.js';

export const counterDeleteActionHandler = {
    name: 'counter-delete',

    async execute(interaction, client, args = []) {
        try {

            try {
                await interaction.deferUpdate();
            } catch (error) {
                logger.error(
                    "Échec de la mise en attente de l'interaction du bouton :",
                    error
                );
                return;
            }

            const [action, counterId, ownerId] = args;

            if (!interaction.inGuild()) {
                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Cette action peut uniquement être utilisée sur un serveur.'
                }).catch(logger.error);

                return;
            }

            if (!action || !counterId) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Les informations nécessaires à la suppression du compteur sont manquantes.'
                }).catch(logger.error);

                return;
            }

            if (ownerId && interaction.user.id !== ownerId) {
                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Seul l’utilisateur ayant lancé cette suppression peut utiliser ces boutons.'
                }).catch(logger.error);

                return;
            }

            if (action === 'cancel') {
                await interaction.editReply({
                    embeds: [
                        createEmbed({
                            title: '❌ Annulation',
                            description: 'La suppression du compteur a été annulée.',
                            color: 'error'
                        })
                    ],
                    components: []
                }).catch(logger.error);

                return;
            }

            if (action !== 'confirm') {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Action de suppression du compteur inconnue.'
                }).catch(logger.error);

                return;
            }

            const { message } = await performDeletionByCounterId(
                client,
                interaction.guild,
                counterId
            );

            await interaction.editReply({
                embeds: [
                    successEmbed(message)
                ],
                components: []
            }).catch(logger.error);

        } catch (error) {
            await handleInteractionError(
                interaction,
                error,
                {
                    type: 'button',
                    handler: 'counter_delete',
                    customId: interaction.customId,
                }
            );
        }
    }
};

export default counterDeleteActionHandler;

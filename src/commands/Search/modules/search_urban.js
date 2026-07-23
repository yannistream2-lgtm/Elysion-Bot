import axios from 'axios';
import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import {
    handleInteractionError,
    replyUserError,
    ErrorTypes
} from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction) {
        try {
            const term = interaction.options.getString('term');

            if (term.length < 2) {
                logger.warn('Commande Urban - terme trop court', {
                    userId: interaction.user.id,
                    term: term,
                    guildId: interaction.guildId
                });

                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Veuillez entrer un terme contenant au moins 2 caractères.'
                });
            }

            let deferTimer = null;

            const clearDeferTimer = () => {
                if (deferTimer) {
                    clearTimeout(deferTimer);
                    deferTimer = null;
                }
            };

            deferTimer = setTimeout(() => {
                InteractionHelper.safeDefer(interaction).catch((deferError) => {
                    logger.debug('Échec du report de réponse de secours de la commande Urban', {
                        error: deferError?.message,
                        interactionId: interaction.id,
                        commandName: 'urban'
                    });
                });
            }, 1500);

            const response = await axios.get(
                `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
                { timeout: 5000 }
            );

            clearDeferTimer();

            if (!response.data?.list?.length) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.USER_INPUT,
                    message: `Aucune définition trouvée pour « ${term} » sur Urban Dictionary.`
                });
            }

            const definition = response.data.list[0];

            const cleanDefinition = definition.definition.replace(/\[|\]/g, '');
            const cleanExample = definition.example.replace(/\[|\]/g, '');

            const formattedDefinition = cleanDefinition
                .replace(/\n\s*\n/g, '\n\n')
                .slice(0, 2000);

            const formattedExample = cleanExample
                ? `*"${cleanExample.replace(/\n/g, ' ').slice(0, 500)}..."*`
                : '*Aucun exemple fourni*';

            const embed = createEmbed({
                title: definition.word,
                description: formattedDefinition,
                color: 'info'
            })
                .setURL(definition.permalink)
                .addFields(
                    {
                        name: 'Exemple',
                        value: formattedExample,
                        inline: false
                    },
                    {
                        name: 'Statistiques',
                        value: `${definition.thumbs_up.toLocaleString()} • ${definition.thumbs_down.toLocaleString()}`,
                        inline: true
                    },
                    {
                        name: 'Auteur',
                        value: definition.author || 'Anonyme',
                        inline: true
                    }
                )
                .setFooter({
                    text: 'Urban Dictionary',
                    iconURL: 'https://i.imgur.com/8aQrX3a.png'
                });

            await InteractionHelper.safeReply(interaction, {
                embeds: [embed]
            });

            logger.info('Définition Urban Dictionary récupérée', {
                userId: interaction.user.id,
                term: term,
                guildId: interaction.guildId,
                commandName: 'urban'
            });

        } catch (error) {
            logger.error('Erreur Urban Dictionary', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                term: interaction.options.getString('term'),
                guildId: interaction.guildId,
                apiStatus: error.response?.status,
                commandName: 'urban'
            });

            if (error.response?.status === 404 || !error.response) {
                await replyUserError(interaction, {
                    type: ErrorTypes.USER_INPUT,
                    message: `Aucune définition trouvée pour « ${interaction.options.getString('term')} » sur Urban Dictionary.`
                });

            } else if (error.response?.status === 429) {
                await replyUserError(interaction, {
                    type: ErrorTypes.RATE_LIMIT,
                    message: 'Trop de requêtes vers Urban Dictionary. Veuillez réessayer dans quelques minutes.'
                });

            } else {
                await handleInteractionError(interaction, error, {
                    commandName: 'urban',
                    source: 'urban_dictionary_api'
                });
            }
        }
    },
};

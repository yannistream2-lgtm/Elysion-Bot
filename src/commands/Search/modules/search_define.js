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
            const deferred = await InteractionHelper.safeDefer(interaction);

            if (!deferred) {
                return;
            }

            const word = interaction.options.getString('word');

            if (word.length < 2) {
                logger.warn('Commande de définition - mot trop court', {
                    userId: interaction.user.id,
                    word: word,
                    guildId: interaction.guildId
                });

                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Veuillez entrer un mot contenant au moins 2 caractères.'
                });
            }

            const response = await axios.get(
                `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
                { timeout: 5000 }
            );

            if (!response.data || response.data.length === 0) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.USER_INPUT,
                    message: `Aucune définition trouvée pour « ${word} ».`
                });
            }

            const data = response.data[0];

            const embed = createEmbed({
                title: data.word,
                description: data.phonetic
                    ? `*${data.phonetic}*`
                    : '',
                color: 'success'
            });

            data.meanings
                .slice(0, 5)
                .forEach(meaning => {
                    const definitions = meaning.definitions
                        .slice(0, 3)
                        .map((def, idx) => {
                            let text = `${idx + 1}. ${def.definition}`;

                            if (def.example) {
                                text += `\n *Exemple : ${def.example}*`;
                            }

                            return text;
                        })
                        .join('\n\n');

                    if (definitions) {
                        embed.addFields({
                            name: `**${meaning.partOfSpeech || 'Définition'}**`,
                            value: definitions,
                            inline: false
                        });
                    }
                });

            embed.setFooter({
                text: 'Propulsé par Free Dictionary API'
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });

            logger.info('Définition du dictionnaire récupérée', {
                userId: interaction.user.id,
                word: word,
                guildId: interaction.guildId,
                commandName: 'define'
            });

        } catch (error) {
            logger.error('Erreur lors de la recherche dans le dictionnaire', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                word: interaction.options.getString('word'),
                guildId: interaction.guildId,
                commandName: 'define'
            });

            if (error.response?.status === 404) {
                await replyUserError(interaction, {
                    type: ErrorTypes.USER_INPUT,
                    message: `Aucune définition trouvée pour « ${interaction.options.getString('word')} ».`
                });

            } else {
                await handleInteractionError(interaction, error, {
                    commandName: 'define',
                    source: 'dictionary_api'
                });
            }
        }
    },
};

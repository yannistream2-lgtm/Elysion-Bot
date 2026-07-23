
import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

const SUPPORT_SERVER_URL = "https://discord.gg/QnWNz2dKCE";

export default {
    data: new SlashCommandBuilder()
        .setName("support")
        .setDescription("Obtenir le lien vers le serveur de support"),

    async execute(interaction) {
        try {
            const supportButton = new ButtonBuilder()
                .setLabel("Rejoindre le serveur de support")
                .setStyle(ButtonStyle.Link)
                .setURL(SUPPORT_SERVER_URL);

            const actionRow = new ActionRowBuilder().addComponents(supportButton);

            await InteractionHelper.safeReply(interaction, {
                embeds: [
                    createEmbed({
                        title: "Besoin d'aide ?",
                        description: "Rejoignez notre serveur officiel de support pour obtenir de l'aide, signaler des bugs ou proposer des fonctionnalités. Si vous personnalisez ce bot, pensez à modifier le lien du serveur de support dans le code !"
                    }),
                ],
                components: [actionRow],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('Erreur de la commande support :', error);

            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: 'Erreur système',
                            description: 'Impossible d\'afficher les informations du support.',
                            color: 'error'
                        })
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (replyError) {
                logger.error('Échec de l\'envoi du message d\'erreur :', replyError);
            }
        }
    },
};
```

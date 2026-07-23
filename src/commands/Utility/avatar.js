import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("avatar")
        .setDescription("Afficher l'avatar d'un utilisateur")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription(
                    "L'utilisateur dont vous souhaitez voir l'avatar (vous-même par défaut)",
                ),
        ),

    async execute(interaction) {
        const user = interaction.options.getUser("target") || interaction.user;
        const avatarUrl = user.displayAvatarURL({ size: 2048, dynamic: true });

        const embed = createEmbed({
            title: `Avatar de ${user.username}`,
            description: `[Lien de téléchargement](${avatarUrl})`
        })
            .setImage(avatarUrl);

        await InteractionHelper.safeReply(interaction, {
            embeds: [embed]
        });

        logger.info(`Commande avatar exécutée`, {
            userId: interaction.user.id,
            targetUserId: user.id,
            guildId: interaction.guildId
        });
    }
};

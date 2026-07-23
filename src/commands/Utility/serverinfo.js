import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("Obtenir des informations détaillées sur le serveur"),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(`Échec de l'interaction ServerInfo`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'serverinfo'
            });
            return;
        }

        const guild = interaction.guild;
        const owner = await guild.fetchOwner();

        const createdTimestamp = Math.floor(guild.createdAt.getTime() / 1000);

        const embed = createEmbed({
            title: `Informations du serveur : ${guild.name}`,
            description: `ID du serveur : ${guild.id}`
        })
            .setThumbnail(guild.iconURL({ size: 256 }))
            .addFields(
                {
                    name: "Propriétaire",
                    value: owner.user.tag,
                    inline: true
                },
                {
                    name: "Membres",
                    value: `${guild.memberCount}`,
                    inline: true
                },
                {
                    name: "Salons",
                    value: `${guild.channels.cache.size}`,
                    inline: true
                },
                {
                    name: "Rôles",
                    value: `${guild.roles.cache.size}`,
                    inline: true
                },
                {
                    name: "Boosts",
                    value: `Niveau ${guild.premiumTier} (${guild.premiumSubscriptionCount})`,
                    inline: true
                },
                {
                    name: "Date de création",
                    value: `<t:${createdTimestamp}:R>`,
                    inline: true
                },
            );

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });

        logger.info(`Commande ServerInfo exécutée`, {
            userId: interaction.user.id,
            guildId: guild.id,
            guildName: guild.name,
            memberCount: guild.memberCount
        });
    },
};

import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("userinfo")
        .setDescription("Obtenir des informations détaillées sur un utilisateur")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("L'utilisateur à inspecter (vous-même par défaut)"),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(`Échec du report de l'interaction UserInfo`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'userinfo'
            });
            return;
        }

        const user = interaction.options.getUser("target") || interaction.user;
        const member = interaction.guild.members.cache.get(user.id);

        const createdTimestamp = Math.floor(user.createdAt.getTime() / 1000);
        const joinedTimestamp = member?.joinedAt
            ? Math.floor(member.joinedAt.getTime() / 1000)
            : null;

        const embed = createEmbed({
            title: `Informations sur l'utilisateur : ${user.username}`
        })
            .setThumbnail(user.displayAvatarURL({ size: 256 }))
            .addFields(
                {
                    name: "ID",
                    value: user.id,
                    inline: true
                },
                {
                    name: "Bot",
                    value: user.bot ? "Oui" : "Non",
                    inline: true
                },
                {
                    name: "Rôles",
                    value:
                        member && member.roles.cache.size > 1
                            ? member.roles.cache
                                .map((r) => r.name)
                                .slice(0, 5)
                                .join(", ")
                            : "Aucun",
                    inline: true,
                },
                {
                    name: "Compte créé",
                    value: `<t:${createdTimestamp}:R>`,
                    inline: false,
                },
                {
                    name: "A rejoint le serveur",
                    value: joinedTimestamp
                        ? `<t:${joinedTimestamp}:R>`
                        : "N'est pas membre du serveur",
                    inline: false,
                },
                {
                    name: "Rôle le plus élevé",
                    value: member?.roles?.highest?.name || "Aucun",
                    inline: true,
                },
            );

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });

        logger.info(`Commande UserInfo exécutée`, {
            userId: interaction.user.id,
            targetUserId: user.id,
            guildId: interaction.guildId
        });
    },
};

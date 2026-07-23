import { getColor } from '../../config/bot.js';
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

import { createEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/moderation/warningService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("Voir tous les avertissements d'un utilisateur")

        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("Utilisateur dont vous souhaitez consulter les avertissements"),
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess =
            await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(
                `Échec du defer de l'interaction Warnings`,
                {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'warnings',
                }
            );
            return;
        }

        const target =
            interaction.options.getUser("target");

        const guildId =
            interaction.guildId;

        // Récupération des avertissements valides
        const validWarnings =
            await WarningService.getWarnings(
                guildId,
                target.id
            );

        const totalWarns =
            validWarnings.length;

        // Aucun avertissement
        if (totalWarns === 0) {
            await InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [
                        createEmbed({
                            title:
                                `Avertissements : ${target.tag}`,

                            description:
                                "Cet utilisateur n'a aucun avertissement enregistré.",
                        }).setColor(
                            getColor('success')
                        ),
                    ],
                }
            );

            return;
        }

        // Embed principal
        const embed = createEmbed({
            title:
                `Avertissements : ${target.tag}`,

            description:
                `Nombre total d'avertissements : **${totalWarns}**`,
        }).setColor(
            getColor('warning')
        );

        // Liste des avertissements
        const warningFields =
            validWarnings
                .map((w, i) => {
                    const discordTimestamp =
                        Math.floor(
                            w.timestamp / 1000
                        );

                    return {
                        name:
                            `[#${i + 1}] Raison : ${w.reason.substring(0, 100)}`,

                        value:
                            `**Modérateur :** <@${w.moderatorId}>\n` +
                            `**Date :** <t:${discordTimestamp}:F> (<t:${discordTimestamp}:R>)`,

                        inline: false,
                    };
                })
                .slice(0, 25);

        embed.addFields(warningFields);

        // Boutons de gestion des avertissements
        const actionRow =
            new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId(
                            `warning_delete_specific:${target.id}:${interaction.user.id}`
                        )
                        .setLabel(
                            'Supprimer un avertissement'
                        )
                        .setStyle(
                            ButtonStyle.Danger
                        ),

                    new ButtonBuilder()
                        .setCustomId(
                            `warning_clear_all:${target.id}:${interaction.user.id}`
                        )
                        .setLabel(
                            'Supprimer tous les avertissements'
                        )
                        .setStyle(
                            ButtonStyle.Danger
                        ),
                );

        // Enregistrement dans les logs
        await logEvent({
            client,
            guild: interaction.guild,

            event: {
                action: "Warnings Viewed",

                target:
                    `${target.tag} (${target.id})`,

                executor:
                    `${interaction.user.tag} (${interaction.user.id})`,

                reason:
                    `Consultation de ${totalWarns} avertissement(s)`,

                metadata: {
                    userId: target.id,
                    moderatorId: interaction.user.id,
                    totalWarnings: totalWarns,
                },
            },
        });

        // Réponse finale
        await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [embed],
                components: [actionRow],
            }
        );
    },
};

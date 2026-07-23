import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags
} from 'discord.js';

import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getModerationCases } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('cases')
        .setDescription('Voir les dossiers de modération et les logs d’audit')
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
        .setDMPermission(false)

        .addStringOption(option =>
            option
                .setName('filter')
                .setDescription('Filtrer les dossiers par type')
                .addChoices(
                    { name: 'Tous les dossiers', value: 'all' },
                    { name: 'Bannissements', value: 'Member Banned' },
                    { name: 'Expulsions', value: 'Member Kicked' },
                    { name: 'Timeouts', value: 'Member Timed Out' },
                    { name: 'Avertissements', value: 'User Warned' }
                )
        )

        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Filtrer les dossiers pour un utilisateur spécifique')
        )

        .addIntegerOption(option =>
            option
                .setName('limit')
                .setDescription('Nombre de dossiers à afficher (par défaut : 10)')
                .setMinValue(1)
                .setMaxValue(50)
        ),

    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess =
            await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(
                `Échec du defer de l'interaction Cases`,
                {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'cases'
                }
            );

            return;
        }

        try {
            const filterType =
                interaction.options.getString('filter') || 'all';

            const targetUser =
                interaction.options.getUser('user');

            const limit =
                interaction.options.getInteger('limit') || 10;

            const filters = {
                limit,
                action:
                    filterType === 'all'
                        ? undefined
                        : filterType,
                userId: targetUser?.id
            };

            const cases = await getModerationCases(
                interaction.guild.id,
                filters
            );

            if (cases.length === 0) {
                throw new Error(
                    targetUser
                        ? `Aucun dossier de modération trouvé pour ${targetUser.tag}`
                        : `Aucun dossier ${filterType === 'all' ? '' : filterType} trouvé sur ce serveur.`
                );
            }

            const CASES_PER_PAGE = 5;
            const totalPages =
                Math.ceil(cases.length / CASES_PER_PAGE);

            let currentPage = 1;

            const createCasesEmbed = (page) => {
                const startIndex =
                    (page - 1) * CASES_PER_PAGE;

                const endIndex =
                    startIndex + CASES_PER_PAGE;

                const pageCases =
                    cases.slice(startIndex, endIndex);

                const embed = createEmbed({
                    title: 'Dossiers de modération',
                    description:
                        `Voici les dossiers de modération pour **${interaction.guild.name}**\n\n` +
                        `**Page ${page} sur ${totalPages}**`
                });

                pageCases.forEach(case_ => {
                    const date =
                        new Date(case_.createdAt)
                            .toLocaleDateString('fr-FR');

                    const time =
                        new Date(case_.createdAt)
                            .toLocaleTimeString('fr-FR');

                    embed.addFields({
                        name:
                            `Dossier #${case_.caseId} - ${case_.action}`,

                        value:
                            `**Utilisateur ciblé :** ${case_.target}\n` +
                            `**Modérateur :** ${case_.executor}\n` +
                            `**Date :** ${date} à ${time}\n` +
                            `**Raison :** ${case_.reason || 'Aucune raison fournie'}`,

                        inline: false
                    });
                });

                embed.setFooter({
                    text:
                        `Total des dossiers : ${cases.length} | ` +
                        `Filtre : ${filterType}` +
                        `${
                            targetUser
                                ? ` | Utilisateur : ${targetUser.tag}`
                                : ''
                        }`
                });

                return embed;
            };

            const createNavigationRow = (page) => {
                const row =
                    new ActionRowBuilder();

                const prevButton =
                    new ButtonBuilder()
                        .setCustomId('prev_page')
                        .setLabel('⬅️ Précédent')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 1);

                const pageInfoButton =
                    new ButtonBuilder()
                        .setCustomId('page_info')
                        .setLabel(
                            `Page ${page}/${totalPages}`
                        )
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true);

                const nextButton =
                    new ButtonBuilder()
                        .setCustomId('next_page')
                        .setLabel('Suivant ➡️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(
                            page === totalPages
                        );

                row.addComponents(
                    prevButton,
                    pageInfoButton,
                    nextButton
                );

                return row;
            };

            const message =
                await interaction.editReply({
                    embeds: [
                        createCasesEmbed(currentPage)
                    ],
                    components: [
                        createNavigationRow(currentPage)
                    ]
                });

            const collector =
                message.createMessageComponentCollector({
                    componentType:
                        ComponentType.Button,
                    time: 120000
                });

            collector.on(
                'collect',
                async (buttonInteraction) => {
                    await buttonInteraction.deferUpdate();

                    if (
                        buttonInteraction.user.id !==
                        interaction.user.id
                    ) {
                        await buttonInteraction.followUp({
                            content:
                                'Vous ne pouvez pas utiliser ces boutons. Utilisez `/cases` pour afficher vos propres dossiers.',
                            flags:
                                MessageFlags.Ephemeral
                        });

                        return;
                    }

                    const { customId } =
                        buttonInteraction;

                    if (
                        customId === 'prev_page' &&
                        currentPage > 1
                    ) {
                        currentPage--;
                    } else if (
                        customId === 'next_page' &&
                        currentPage < totalPages
                    ) {
                        currentPage++;
                    }

                    await interaction.editReply({
                        embeds: [
                            createCasesEmbed(
                                currentPage
                            )
                        ],
                        components: [
                            createNavigationRow(
                                currentPage
                            )
                        ]
                    });
                }
            );

            collector.on(
                'end',
                async () => {
                    const disabledRow =
                        createNavigationRow(
                            currentPage
                        );

                    disabledRow.components.forEach(
                        button =>
                            button.setDisabled(true)
                    );

                    try {
                        await message.edit({
                            components: [
                                disabledRow
                            ]
                        });
                    } catch (error) {
                        // Le message peut avoir été supprimé
                    }
                }
            );

        } catch (error) {
            logger.error(
                'Erreur dans la commande cases :',
                error
            );

            return await replyUserError(
                interaction,
                {
                    type: ErrorTypes.UNKNOWN,
                    message:
                        'Une erreur est survenue lors de la récupération des dossiers de modération. Veuillez réessayer plus tard.'
                }
            );
        }
    }
};

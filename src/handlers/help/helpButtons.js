import { createEmbed } from '../../utils/embeds.js';
import { createAllCommandsMenu } from './helpSelectMenus.js';
import { createInitialHelpMenu } from '../../commands/Core/help.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';

const BACK_BUTTON_ID = "help-back-to-main";
const PAGINATION_PREFIX = "help-page";
const BUG_REPORT_BUTTON_ID = "help-bug-report";

export const helpBackButton = {
    name: BACK_BUTTON_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const { embeds, components } = await createInitialHelpMenu(client);
            await interaction.editReply({
                embeds,
                components,
            });
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('L\'interaction du bouton retour de l\'aide a déjà été traitée ou a expiré.', {
                    event: 'interaction.help.button.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            throw error;
        }
    },
};

export const helpBugReportButton = {
    name: BUG_REPORT_BUTTON_ID,
    async execute(interaction, client) {
        const githubButton = new ButtonBuilder()
            .setLabel('🐛 Signaler un bug sur GitHub')
            .setStyle(ButtonStyle.Link)
            .setURL('https://github.com/codebymitch/TitanBot/issues');

        const bugRow = new ActionRowBuilder().addComponents(githubButton);

        const bugReportEmbed = createEmbed({
            title: '🐛 Rapport de bug',
            description: 'Vous avez trouvé un bug ? Veuillez le signaler sur notre page GitHub Issues !\n\n' +
                '**Lors du signalement d\'un bug, veuillez inclure :**\n' +
                '• 📝 Une description détaillée du problème\n' +
                '• 📋 Les étapes pour reproduire le problème\n' +
                '• 📸 Des captures d\'écran si nécessaire\n' +
                '• 💻 La version de votre bot et votre environnement\n\n' +
                'Cela nous aide à corriger les problèmes plus rapidement et plus efficacement !',
            color: 'error'
        });

        bugReportEmbed.setFooter({
            text: 'Système de signalement des bugs de TitanBot',
            iconURL: client.user.displayAvatarURL()
        });

        bugReportEmbed.setTimestamp();

        await interaction.reply({
            embeds: [bugReportEmbed],
            components: [bugRow],
            flags: MessageFlags.Ephemeral
        });
    },
};

function getPaginationInfo(components) {
    for (const row of components || []) {
        for (const component of row.components || []) {
            if (component.customId === `${PAGINATION_PREFIX}_page`) {
                const label = component.label || '';
                const match = label.match(/Page\s+(\d+)\s+sur\s+(\d+)/i);

                if (match) {
                    return {
                        currentPage: Number(match[1]),
                        totalPages: Number(match[2]),
                    };
                }
            }
        }
    }

    return { currentPage: 1, totalPages: 1 };
}

export const helpPaginationButton = {
    name: `${PAGINATION_PREFIX}_next`,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const { currentPage, totalPages } = getPaginationInfo(interaction.message?.components);

            let nextPage = currentPage;

            switch (interaction.customId) {
                case `${PAGINATION_PREFIX}_first`:
                    nextPage = 1;
                    break;

                case `${PAGINATION_PREFIX}_prev`:
                    nextPage = Math.max(1, currentPage - 1);
                    break;

                case `${PAGINATION_PREFIX}_next`:
                    nextPage = Math.min(totalPages, currentPage + 1);
                    break;

                case `${PAGINATION_PREFIX}_last`:
                    nextPage = totalPages;
                    break;

                default:
                    nextPage = currentPage;
                    break;
            }

            const { embeds, components } = await createAllCommandsMenu(nextPage, client);
            await interaction.editReply({ embeds, components });

        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('L\'interaction de pagination de l\'aide a déjà été traitée ou a expiré.', {
                    event: 'interaction.help.pagination.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            throw error;
        }
    },
};

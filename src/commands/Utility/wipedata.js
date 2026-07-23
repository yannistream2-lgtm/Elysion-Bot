import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { getConfirmationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    slashOnly: true,

    data: new SlashCommandBuilder()
        .setName('wipedata')
        .setDescription('Supprimer toutes vos données personnelles du bot (irréversible)'),

    async execute(interaction, guildConfig, client) {

        const warningMessage =
            `⚠️ **CETTE ACTION EST IRRÉVERSIBLE !** ⚠️\n\n` +
            `Cette action supprimera définitivement **TOUTES** vos données de ce serveur, notamment :\n` +
            `• 💰 Solde économique (portefeuille et banque)\n` +
            `• 📊 Niveaux et XP\n` +
            `• 🎒 Objets de l'inventaire\n` +
            `• 🛍️ Achats effectués dans la boutique\n` +
            `• 🎂 Informations d'anniversaire\n` +
            `• 🔢 Données des compteurs\n` +
            `• 📋 Toutes les autres données personnelles\n\n` +
            `**Cette action est définitive et ne peut pas être annulée. Êtes-vous absolument sûr ?**`;

        const embed = warningEmbed(
            'Supprimer toutes les données',
            warningMessage
        );

        const confirmButtons = getConfirmationButtons('wipedata');

        await InteractionHelper.safeReply(interaction, {
            embeds: [embed],
            components: [confirmButtons],
            flags: MessageFlags.Ephemeral
        });

        logger.info(`Commande Wipedata exécutée - demande de confirmation affichée`, {
            userId: interaction.user.id,
            guildId: interaction.guildId
        });
    }
};

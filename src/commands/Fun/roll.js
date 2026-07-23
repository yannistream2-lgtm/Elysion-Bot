import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Lance des dés avec la notation standard (ex. 2d20, 1d6 + 5).")
    .addStringOption((option) =>
      option
        .setName("notation")
        .setDescription("La notation des dés (ex. 2d6, 1d20 + 4)")
        .setRequired(true)
        .setMaxLength(50),
    ),

  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const notation = interaction.options
      .getString("notation")
      .toLowerCase()
      .replace(/\s/g, "");

    const match = notation.match(/^(\d*)d(\d+)([\+\-]\d+)?$/);

    if (!match) {
      throw new TitanBotError(
        `Notation de dés invalide : ${notation}`,
        ErrorTypes.USER_INPUT,
        'Notation invalide. Utilisez un format comme `1d20` ou `3d6+5`.',
      );
    }

    const numDice = parseInt(match[1] || "1", 10);
    const numSides = parseInt(match[2], 10);
    const modifier = parseInt(match[3] || "0", 10);

    if (numDice < 1 || numDice > 20) {
      throw new TitanBotError(
        `Trop de dés demandés : ${numDice}`,
        ErrorTypes.VALIDATION,
        'Veuillez utiliser entre 1 et 20 dés.',
      );
    }

    if (numSides < 1 || numSides > 1000) {
      throw new TitanBotError(
        `Nombre de faces invalide : ${numSides}`,
        ErrorTypes.VALIDATION,
        'Veuillez utiliser un dé ayant entre 1 et 1000 faces.',
      );
    }

    const rolls = [];
    let totalRoll = 0;

    for (let i = 0; i < numDice; i++) {
      const roll = Math.floor(Math.random() * numSides) + 1;

      rolls.push(roll);
      totalRoll += roll;
    }

    const finalTotal = totalRoll + modifier;

    const resultsDetail =
      numDice > 1
        ? `**Résultats des dés :** ${rolls.join(" + ")}\n`
        : "";

    const modifierText =
      modifier !== 0
        ? `+ (${modifier})`
        : "";

    const embed = successEmbed(
      `🎲 Lancer de ${numDice}d${numSides}${modifier !== 0 ? match[3] : ""}`,
      `${resultsDetail}**Total des dés :** ${totalRoll}${modifierText} = **${finalTotal}**`,
    );

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [embed],
    });

    logger.debug(
      `Commande roll exécutée par l'utilisateur ${interaction.user.id} avec la notation ${notation} sur le serveur ${interaction.guildId}`,
    );
  },
};

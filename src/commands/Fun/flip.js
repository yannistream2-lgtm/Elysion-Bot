import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName("flip")
    .setDescription("Lance une pièce (Pile ou Face)."),

  category: 'Fun',

  async execute(interaction, config, client) {
    const result = Math.random() < 0.5 ? "Pile" : "Face";
    const emoji = result === "Pile" ? "🪙" : "🔮";

    const embed = successEmbed(
      "Pile ou Face ?",
      `La pièce est tombée sur... **${result}** ${emoji} !`,
    );

    await InteractionHelper.safeReply(interaction, {
      embeds: [embed],
    });

    logger.debug(
      `Commande flip exécutée par l'utilisateur ${interaction.user.id} sur le serveur ${interaction.guildId}`,
    );
  },
};

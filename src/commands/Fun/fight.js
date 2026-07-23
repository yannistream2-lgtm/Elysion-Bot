import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

const rand = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const EMBED_DESCRIPTION_LIMIT = 4096;

export default {
  data: new SlashCommandBuilder()
    .setName("fight")
    .setDescription("Lance un combat simulé en 1 contre 1.")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("L'utilisateur que vous souhaitez affronter.")
        .setRequired(true),
    ),

  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const challenger = interaction.user;
    const opponent = interaction.options.getUser("opponent");

    // Le joueur essaie de se combattre lui-même
    if (challenger.id === opponent.id) {
      const embed = warningEmbed(
        "⚔️ Défi invalide",
        `**${challenger.username}**, vous ne pouvez pas vous combattre vous-même ! C'est un match nul avant même que le combat commence.`,
      );

      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
      });
    }

    // L'adversaire est un bot
    if (opponent.bot) {
      const embed = warningEmbed(
        "⚔️ Adversaire invalide",
        "Vous ne pouvez pas combattre les bots ! Défiez plutôt un vrai joueur.",
      );

      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
      });
    }

    // Détermination du gagnant
    const winner =
      rand(0, 1) === 0
        ? challenger
        : opponent;

    const loser =
      winner.id === challenger.id
        ? opponent
        : challenger;

    const rounds = rand(3, 7);
    const damage = rand(10, 50);

    const log = [];

    log.push(
      `💥 **${challenger.username}** défie **${opponent.username}** en duel ! (Meilleur des ${rounds} manches)`,
    );

    // Simulation des manches
    for (let i = 1; i <= rounds; i++) {
      const attacker =
        rand(0, 1) === 0
          ? challenger
          : opponent;

      const target =
        attacker.id === challenger.id
          ? opponent
          : challenger;

      const action = [
        "lance un coup de poing sauvage",
        "porte un coup critique",
        "utilise un sort faible",
        "pare l'attaque et contre-attaque",
      ][rand(0, 3)];

      log.push(
        `\n**Manche ${i} :** ${attacker.username} ${action} contre ${target.username} et inflige **${rand(1, damage)} dégâts** !`,
      );
    }

    const outcomeText = log.join("\n");

    const winnerText =
      `👑 **${winner.username}** a vaincu ${loser.username} et remporte la victoire !`;

    const fullDescription =
      `${outcomeText}\n\n${winnerText}`;

    // Limite de caractères des descriptions Discord
    const description =
      fullDescription.length <= EMBED_DESCRIPTION_LIMIT
        ? fullDescription
        : `${fullDescription.slice(0, EMBED_DESCRIPTION_LIMIT - 15)}\n\n...`;

    const embed = successEmbed(
      "🏆 Duel terminé !",
      description,
    );

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [embed],
    });

    logger.debug(
      `Commande fight exécutée entre ${challenger.id} et ${opponent.id} sur le serveur ${interaction.guildId}`,
    );
  },
};

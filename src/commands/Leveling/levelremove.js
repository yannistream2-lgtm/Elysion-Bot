import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { removeLevels, getUserLevelData, getLevelingConfig } from '../../services/leveling/leveling.js';
import { createEmbed } from '../../utils/embeds.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('retirerniveaux')
    .setDescription('Retirer des niveaux à un utilisateur')
    .addUserOption((option) =>
      option
        .setName('utilisateur')
        .setDescription('L’utilisateur auquel retirer des niveaux')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('niveaux')
        .setDescription('Nombre de niveaux à retirer')
        .setRequired(true)
        .setMinValue(1)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const hasPermission = await checkUserPermissions(
      interaction,
      PermissionFlagsBits.ManageGuild,
      'Vous devez avoir la permission **Gérer le serveur** pour utiliser cette commande.'
    );

    if (!hasPermission) return;

    const levelingConfig = await getLevelingConfig(client, interaction.guildId);

    if (!levelingConfig?.enabled) {
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('#f1c40f')
            .setDescription('Le système de niveaux est actuellement désactivé sur ce serveur.')
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetUser = interaction.options.getUser('utilisateur');
    const levelsToRemove = interaction.options.getInteger('niveaux');

    const member = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!member) {
      throw new TitanBotError(
        `Utilisateur ${targetUser.id} introuvable sur ce serveur`,
        ErrorTypes.USER_INPUT,
        'L’utilisateur spécifié ne fait pas partie de ce serveur.'
      );
    }

    const userData = await getUserLevelData(
      client,
      interaction.guildId,
      targetUser.id
    );

    if (userData.level === 0) {
      throw new TitanBotError(
        `Utilisateur ${targetUser.id} déjà au niveau minimum`,
        ErrorTypes.VALIDATION,
        `${targetUser.tag} est déjà au niveau 0 et aucun niveau supplémentaire ne peut lui être retiré.`
      );
    }

    const updatedData = await removeLevels(
      client,
      interaction.guildId,
      targetUser.id,
      levelsToRemove
    );

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        createEmbed({
          title: 'Niveaux retirés',
          description: `**${levelsToRemove}** niveau(x) ont été retirés avec succès à ${targetUser.tag}.\n**Nouveau niveau :** ${updatedData.level}`,
          color: 'success'
        })
      ]
    });

    logger.info(
      `[ADMIN] L'utilisateur ${interaction.user.tag} a retiré ${levelsToRemove} niveau(x) à ${targetUser.tag} dans le serveur ${interaction.guildId}`
    );
  }
};

import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling/leveling.js';
import { addXp } from '../services/leveling/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix, getBotMessage, isBotOwner, isCommandCategoryEnabled, isMaintenanceMode } from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import {
  getCountingGameConfig,
  saveCountingGameConfig,
  isValidCountingMessage,
  recordCorrectCount,
} from '../services/countingGameService.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;

export default {
  name: Events.MessageCreate,

  async execute(message, client) {
    try {
      // Ignorer les messages des bots et les messages en dehors des serveurs
      if (message.author.bot || !message.guild) return;

      logger.debug(`Message reçu de ${message.author.tag} : ${message.content}`);

      // Gestion du jeu de comptage
      const countingProcessed = await handleCountingGame(message, client);

      if (countingProcessed) {
        return;
      }

      // Gestion des commandes avec préfixe
      await handlePrefixCommand(message, client);

      // Gestion du système de niveaux et d'XP
      await handleLeveling(message, client);

    } catch (error) {
      logger.error('Erreur dans l’événement messageCreate :', error);
    }
  }
};

/**
 * Gère les commandes utilisant le préfixe.
 */
async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(
      client,
      message.guild.id
    );

    const prefix = guildConfig?.prefix || getCommandPrefix();

    const parsed = parsePrefixCommand(
      message.content,
      prefix
    );

    if (!parsed) {
      return;
    }

    let { commandName, args } = parsed;

    // Raccourcis des commandes musicales avec préfixe
    const musicPrefixShortcut = commandName.toLowerCase();

    const MUSIC_PREFIX_SHORTCUTS = new Set([
      'leave',
      'pause',
      'resume',
      'skip',
      'stop',
      'volume'
    ]);

    if (MUSIC_PREFIX_SHORTCUTS.has(musicPrefixShortcut)) {
      commandName = 'music';
      args = [
        musicPrefixShortcut,
        ...args
      ];
    }

    logger.info(
      `Commande avec préfixe détectée : ${commandName}, arguments : ${args.join(', ')}`
    );

    // Résoudre les alias de commandes
    const resolvedCommandName = resolveCommandAlias(commandName);

    logger.info(
      `Nom de commande résolu : ${resolvedCommandName}`
    );

    const command = client.commands.get(
      resolvedCommandName
    );

    if (!command) {
      logger.warn(
        `Commande introuvable : ${resolvedCommandName}`
      );

      return;
    }

    // Vérifier si le bot est en maintenance
    if (
      isMaintenanceMode() &&
      !isBotOwner(message.author.id)
    ) {
      await message.channel.send({
        embeds: [
          createEmbed({
            title: 'Mode maintenance',
            description: getBotMessage('maintenanceMode'),
            color: 'warning',
          })
        ],
      }).catch(() => {});

      return;
    }

    // Vérifier si la catégorie de la commande est activée
    if (!isCommandCategoryEnabled(command.category)) {
      await message.channel.send({
        embeds: [
          createEmbed({
            title: 'Fonctionnalité désactivée',
            description: getBotMessage('commandDisabled'),
            color: 'error',
          })
        ],
      }).catch(() => {});

      return;
    }

    // Vérifier si la commande est disponible avec le préfixe
    const restriction = getPrefixRestriction(
      command,
      args,
      resolveSubcommandAlias
    );

    if (
      !supportsPrefixExecution(command) ||
      restriction.blocked
    ) {
      if (
        restriction.blocked &&
        restriction.reason
      ) {
        const embed = createEmbed({
          title: 'Commande Slash uniquement',
          description:
            `${restriction.reason}\n` +
            `Utilisez \`/${resolvedCommandName}\` à la place.`,
          color: 'info',
        });

        await message.channel.send({
          embeds: [embed]
        }).catch(() => {});
      }

      return;
    }

    // Vérifier si la commande est activée sur le serveur
    if (
      !(await isCommandEnabled(
        client,
        message.guild.id,
        resolvePrefixAccessKey(
          command.data,
          args
        ),
        command.category
      ))
    ) {
      const embed = createEmbed({
        title: 'Commande désactivée',
        description:
          'Cette commande a été désactivée pour ce serveur.',
        color: 'error',
      });

      await message.channel.send({
        embeds: [embed]
      }).catch(() => {});

      return;
    }

    // Créer une interaction simulée pour le système anti-abus
    const mockInteractionForProtection = {
      guildId: message.guild.id,
      user: message.author,
    };

    const abuseProtection =
      await enforceAbuseProtection(
        mockInteractionForProtection,
        command,
        resolvedCommandName,
      );

    if (!abuseProtection.allowed) {
      const formattedCooldown =
        formatCooldownDuration(
          abuseProtection.remainingMs
        );

      const embed = createEmbed({
        title: 'Temps d’attente de la commande',
        description:
          `Cette commande est temporairement indisponible. ` +
          `Veuillez patienter ${formattedCooldown} avant de réessayer.`,
        color: 'error',
      });

      await message.channel.send({
        embeds: [embed]
      }).catch(() => {});

      return;
    }

    logger.info(
      `Exécution de la commande avec préfixe : ` +
      `${prefix}${commandName} ` +
      `(résolue en ${resolvedCommandName}) ` +
      `par ${message.author.tag}`
    );

    // Exécuter la commande
    await executePrefixCommand(
      command,
      message,
      args,
      client,
      prefix,
      guildConfig
    );

  } catch (error) {
    logger.error(
      'Erreur lors de la gestion de la commande avec préfixe :',
      error
    );
  }
}

/**
 * Gère le jeu de comptage.
 */
async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(
      client,
      message.guild.id
    );

    // Vérifier si le jeu est actif dans ce salon
    if (
      !config.enabled ||
      !config.channelId ||
      message.channel.id !== config.channelId
    ) {
      return false;
    }

    const content = message.content.trim();

    const validCount = isValidCountingMessage(
      content,
      config
    );

    const invalidAttempt =
      !validCount ||
      message.author.id === config.lastUserId;

    // Le comptage est incorrect
    if (invalidAttempt) {
      await message.delete().catch(() => {});

      await saveCountingGameConfig(
        client,
        message.guild.id,
        {
          ...config,
          nextNumber: 1,
          lastUserId: null,
          currentStreak: 0,
        }
      );

      const failureMessage =
        await message.channel.send(
          `❌ Comptage interrompu par <@${message.author.id}>. ` +
          `La séquence a été réinitialisée à **1**.`
        );

      setTimeout(() => {
        failureMessage.delete().catch(() => {});
      }, 10000);

      return true;
    }

    // Enregistrer le nombre correct
    await recordCorrectCount(
      client,
      message.guild.id,
      message.author.id
    );

    return true;

  } catch (error) {
    logger.error(
      'Erreur lors de la gestion du jeu de comptage :',
      error
    );

    return false;
  }
}

/**
 * Gère le système de niveaux et d'XP.
 */
async function handleLeveling(message, client) {
  try {
    // Limiter le nombre de traitements XP
    const rateLimitKey =
      `xp-event:${message.guild.id}:${message.author.id}`;

    const canProcess =
      await checkRateLimit(
        rateLimitKey,
        MESSAGE_XP_RATE_LIMIT_ATTEMPTS,
        MESSAGE_XP_RATE_LIMIT_WINDOW_MS
      );

    if (!canProcess) {
      return;
    }

    // Récupérer la configuration du système de niveaux
    const levelingConfig =
      await getLevelingConfig(
        client,
        message.guild.id
      );

    // Vérifier si le système de niveaux est activé
    if (!levelingConfig?.enabled) {
      return;
    }

    // Vérifier les salons ignorés
    if (
      levelingConfig.ignoredChannels?.includes(
        message.channel.id
      )
    ) {
      return;
    }

    // Vérifier les rôles ignorés
    if (
      levelingConfig.ignoredRoles?.length > 0
    ) {
      const member =
        await message.guild.members
          .fetch(message.author.id)
          .catch(() => {
            return null;
          });

      if (
        member &&
        member.roles.cache.some(role =>
          levelingConfig.ignoredRoles.includes(
            role.id
          )
        )
      ) {
        return;
      }
    }

    // Vérifier les utilisateurs blacklistés
    if (
      levelingConfig.blacklistedUsers?.includes(
        message.author.id
      )
    ) {
      return;
    }

    // Ignorer les messages vides
    if (
      !message.content ||
      message.content.trim().length === 0
    ) {
      return;
    }

    // Récupérer les données de niveau de l'utilisateur
    const userData =
      await getUserLevelData(
        client,
        message.guild.id,
        message.author.id
      );

    // Vérifier le délai entre deux gains d'XP
    const cooldownTime =
      levelingConfig.xpCooldown || 60;

    const now = Date.now();

    const timeSinceLastMessage =
      now -
      (userData.lastMessage || 0);

    if (
      timeSinceLastMessage <
      cooldownTime * 1000
    ) {
      return;
    }

    // Déterminer la quantité minimale et maximale d'XP
    const minXP =
      levelingConfig.xpRange?.min ||
      levelingConfig.xpPerMessage?.min ||
      15;

    const maxXP =
      levelingConfig.xpRange?.max ||
      levelingConfig.xpPerMessage?.max ||
      25;

    // Sécuriser les valeurs d'XP
    const safeMinXP =
      Math.max(1, minXP);

    const safeMaxXP =
      Math.max(
        safeMinXP,
        maxXP
      );

    // Calculer l'XP gagnée aléatoirement
    const xpToGive =
      Math.floor(
        Math.random() *
        (safeMaxXP - safeMinXP + 1)
      ) +
      safeMinXP;

    let finalXP = xpToGive;

    // Appliquer le multiplicateur d'XP
    if (
      levelingConfig.xpMultiplier &&
      levelingConfig.xpMultiplier > 1
    ) {
      finalXP =
        Math.floor(
          finalXP *
          levelingConfig.xpMultiplier
        );
    }

    // Ajouter l'XP à l'utilisateur
    const result =
      await addXp(
        client,
        message.guild,
        message.member,
        finalXP
      );

    // Informer dans les logs lorsqu'un utilisateur monte de niveau
    if (result?.leveledUp) {
      logger.info(
        `${message.author.tag} est passé au niveau ${result.level} ` +
        `sur ${message.guild.name}`
      );
    }

  } catch (error) {
    logger.error(
      'Erreur lors de la gestion du niveau pour le message :',
      error
    );
  }
}

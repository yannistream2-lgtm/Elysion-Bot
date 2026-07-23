import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import {
  reconcileTicketPanels,
  reconcileVerificationPanels,
  reconcileReactionRolePanelHealth
} from "../services/panelHealthService.js";
import { reconcileLevelRoles } from "../services/leveling/levelRoleSyncService.js";
import { initRiffyAfterReady } from "../services/music/riffySetup.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      client.user.setPresence(config.bot.presence);

      startupLog(`Prêt ! Connecté en tant que ${client.user.tag}`);
      startupLog(`Serveur(s) desservi(s) : ${client.guilds.cache.size}`);
      startupLog(`Commandes chargées : ${client.commands.size}`);

      if (client.config?.features?.music) {
        initRiffyAfterReady(client);
      }

      const reconciliationSummary =
        await reconcileReactionRoleMessages(client);

      startupLog(
        `Synchronisation des rôles par réaction : ${reconciliationSummary.scannedMessages} messages analysés, ${reconciliationSummary.removedMessages} supprimés, ${reconciliationSummary.errors} erreur(s)`
      );

      const verificationPanelSummary =
        await reconcileVerificationPanels(client);

      startupLog(
        `État des panneaux de vérification : ${verificationPanelSummary.scannedGuilds} serveur(s) analysé(s), ${verificationPanelSummary.healthyPanels} panneau(x) fonctionnel(s), ${verificationPanelSummary.deletedPanels} supprimé(s), ${verificationPanelSummary.missingChannels} salon(s) introuvable(s), ${verificationPanelSummary.recoveredIds} ID(s) récupéré(s), ${verificationPanelSummary.errors} erreur(s)`
      );

      const reactionRolePanelSummary =
        await reconcileReactionRolePanelHealth(client);

      startupLog(
        `État des panneaux de rôles par réaction : ${reactionRolePanelSummary.scannedPanels} panneau(x) analysé(s), ${reactionRolePanelSummary.healthyPanels} fonctionnel(s), ${reactionRolePanelSummary.deletedPanels} supprimé(s), ${reactionRolePanelSummary.missingChannels} salon(s) introuvable(s), ${reactionRolePanelSummary.recoveredIds} ID(s) récupéré(s), ${reactionRolePanelSummary.errors} erreur(s)`
      );

      const levelRoleSummary =
        await reconcileLevelRoles(client);

      startupLog(
        `Synchronisation des rôles de niveau : ${levelRoleSummary.scannedGuilds} serveur(s) analysé(s), ${levelRoleSummary.prunedRewardEntries} récompense(s) obsolète(s) supprimée(s), ${levelRoleSummary.rolesReAwarded} rôle(s) réattribué(s), ${levelRoleSummary.errors} erreur(s)`
      );
    } catch (error) {
      logger.error(
        "Erreur lors de l'événement ready :",
        error
      );
    }
  },
};

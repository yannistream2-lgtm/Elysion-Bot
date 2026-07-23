import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
data: new SlashCommandBuilder()
.setName("untimeout")
.setDescription("Retirer le timeout d'un utilisateur")
.addUserOption((option) =>
option
.setName("target")
.setDescription("Utilisateur dont le timeout doit être retiré")
.setRequired(true),
)
.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

```
category: "moderation",

async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);

    if (!deferSuccess) {
        logger.warn(`Échec de la réponse différée de l'interaction untimeout`, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName: 'untimeout',
        });
        return;
    }

    const targetUser = interaction.options.getUser("target");
    const member = interaction.options.getMember("target");

    if (!targetUser) {
        throw new TitanBotError(
            'Utilisateur cible manquant',
            ErrorTypes.USER_INPUT,
            'Vous devez spécifier un utilisateur dont le timeout doit être retiré.',
            { subtype: 'invalid_user' },
        );
    }

    if (!member) {
        throw new TitanBotError(
            "Cible introuvable",
            ErrorTypes.USER_INPUT,
            "L'utilisateur cible n'est actuellement pas présent sur ce serveur.",
        );
    }

    await ModerationService.removeTimeoutUser({
        guild: interaction.guild,
        member,
        moderator: interaction.member,
    });

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                `🔓 **Timeout retiré** de ${targetUser.tag}`,
            ),
        ],
    });
},
```

};

export const shopItems = [
    {
        id: 'extra_work',
        name: 'Service de Travail Supplémentaire',
        price: 5000,
        description: 'Permet d’utiliser la commande `/work` 1 fois supplémentaire.',
        type: 'consumable',
        maxQuantity: 5,
        cooldown: 86400000,
        effect: {
            type: 'command_boost',
            command: 'work',
            uses: 1
        }
    },

    {
        id: 'bank_upgrade_1',
        name: 'Amélioration Bancaire I',
        price: 15000,
        description: 'Augmente la capacité de votre banque et permet d’y déposer davantage de pièces.',
        type: 'upgrade',
        maxLevel: 5,
        effect: {
            type: 'bank_capacity',
            multiplier: 1.5
        }
    },

    {
        id: 'diamond_pickaxe',
        name: 'Pioche en Diamant',
        price: 50000,
        description: 'Augmente les ressources obtenues avec la commande `/mine`.',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'mining_yield',
            multiplier: 2.0
        }
    },

    {
        id: 'premium_role',
        name: 'Rôle Premium du Serveur',
        price: 15000,
        description: 'Un rôle spécial offrant une couleur exclusive et un bonus quotidien de 10 %.',
        type: 'role',
        roleId: null,
        effect: {
            type: 'daily_bonus',
            multiplier: 1.1
        }
    },

    {
        id: 'lucky_clover',
        name: 'Trèfle Porte-Bonheur',
        price: 10000,
        description: 'Augmente les chances d’obtenir une récompense plus élevée avec `/gamble` une fois.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.5,
            uses: 1
        }
    },

    {
        id: 'fishing_rod',
        name: '🎣 Canne à Pêche',
        price: 5000,
        description: 'Utilisée pour les commandes de pêche.',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'fishing_yield',
            multiplier: 1.0
        }
    },

    {
        id: 'pickaxe',
        name: '⛏️ Pioche',
        price: 7500,
        description: 'Utilisée pour les commandes de minage.',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'mining_yield',
            multiplier: 1.2
        }
    },

    {
        id: 'laptop',
        name: '💻 Ordinateur Portable',
        price: 15000,
        description: 'Augmente les gains obtenus grâce au travail.',
        type: 'tool',
        durability: 200,
        effect: {
            type: 'work_yield',
            multiplier: 1.5
        }
    },

    {
        id: 'lucky_charm',
        name: '🍀 Porte-Bonheur',
        price: 10000,
        description: 'Augmente votre chance lors des jeux d’argent. Possède 3 utilisations avant d’être consommé.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.3,
            uses: 3
        }
    },

    {
        id: 'bank_note',
        name: '📜 Billet Bancaire',
        price: 25000,
        description: 'Augmente la capacité de votre banque de 10 000 pièces. Peut être acheté plusieurs fois.',
        type: 'tool',
        durability: null,
        effect: {
            type: 'bank_capacity',
            increase: 10000
        }
    },

    {
        id: 'personal_safe',
        name: '🔒 Coffre-Fort Personnel',
        price: 30000,
        description: 'Protège votre argent contre les vols et empêche les autres joueurs de vous braquer.',
        type: 'tool',
        durability: null,
        effect: {
            type: 'robbery_protection',
            protection: true
        }
    }
];

export function getItemById(itemId) {
    return shopItems.find(item => item.id === itemId);
}

export function getItemsByType(type) {
    return shopItems.filter(item => item.type === type);
}

export function getItemPrice(itemId) {
    const item = getItemById(itemId);
    return item ? item.price : 0;
}

export function validatePurchase(itemId, userData) {
    const item = getItemById(itemId);

    if (!item) {
        return {
            valid: false,
            reason: 'Objet introuvable'
        };
    }

    const inventory = userData.inventory || {};
    const upgrades = userData.upgrades || {};

    // Vérification de la quantité maximale des objets consommables.
    if (item.type === 'consumable' && item.maxQuantity) {
        const currentQuantity = inventory[itemId] || 0;

        if (currentQuantity >= item.maxQuantity) {
            return {
                valid: false,
                reason: `Vous ne pouvez posséder que ${item.maxQuantity} ${item.name} maximum.`
            };
        }
    }

    // Vérification du niveau maximum des améliorations.
    if (item.type === 'upgrade' && item.maxLevel) {

        if (upgrades[itemId]) {
            return {
                valid: false,
                reason: `Vous avez déjà acheté ${item.name}.`
            };
        }
    }

    // Vérification des outils déjà possédés.
    if (item.type === 'tool') {

        const currentQuantity = inventory[itemId] || 0;

        if (itemId !== 'bank_note' && currentQuantity > 0) {
            return {
                valid: false,
                reason: `Vous possédez déjà ${item.name}.`
            };
        }
    }

    // Vérification du rôle Premium déjà possédé.
    if (item.type === 'role' && item.roleId) {

        if (userData.roles?.includes(item.roleId)) {
            return {
                valid: false,
                reason: `Vous possédez déjà le rôle ${item.name}.`
            };
        }
    }

    return {
        valid: true
    };
}

/**
 * Modèles de documents légaux — TRAMES À FAIRE VALIDER PAR UN JURISTE avant tout lancement.
 * Ils structurent les obligations identifiées (code de la consommation, P2B, DSA, DAC7, RGPD),
 * mais ne constituent pas une conformité juridique acquise.
 */
export const legalDocs: Record<string, { title: string; sections: { h: string; p: string }[] }> = {
  cgu: { title: "Conditions générales d'utilisation", sections: [
    { h: "Objet", p: "La plateforme met en relation des particuliers, des commerciaux indépendants et des entreprises fournisseurs pour l'achat et la vente de biens. Elle agit en qualité d'opérateur de plateforme en ligne et n'est pas partie aux contrats de vente conclus entre utilisateurs." },
    { h: "Comptes et statuts", p: "Chaque utilisateur choisit un statut (particulier, indépendant, fournisseur). Les profils professionnels sont vérifiés (identité, immatriculation). Un particulier vendant de manière habituelle à des fins lucratives doit adopter un statut professionnel." },
    { h: "Classement des offres", p: "Les annonces sont classées par défaut selon leur date de publication ; les autres critères (prix, popularité, pertinence) sont sélectionnables. Aucun classement n'est influencé par une rémunération sans que cela soit indiqué (art. L111-7 C. conso., règlement P2B)." },
    { h: "Produits interdits et modération", p: "Sont interdits notamment : armes, stupéfiants, contrefaçons, médicaments, animaux vivants, produits rappelés. Tout utilisateur peut signaler un contenu ; chaque décision de retrait est motivée et peut être contestée (DSA art. 16, 17 et 20)." },
    { h: "Suspension", p: "En cas de manquement, la plateforme peut suspendre un compte après notification motivée, sauf urgence (fraude, sécurité)." },
  ] },
  cgv: { title: "Conditions générales de vente et de services de paiement", sections: [
    { h: "Prix et frais", p: "Les frais de service et commissions applicables sont ceux affichés sur la page « Comment ça marche » au moment de la commande ; ils sont calculés automatiquement et figés à la commande." },
    { h: "Paiement", p: "Le paiement est collecté par un prestataire de services de paiement agréé. Les fonds sont reversés aux bénéficiaires après confirmation de la réception et expiration du délai de validation." },
    { h: "Vendeur professionnel", p: "Pour les achats auprès d'un professionnel : droit de rétractation de 14 jours à compter de la réception (art. L221-18 C. conso.), garantie légale de conformité (2 ans) et garantie des vices cachés." },
    { h: "Vendeur particulier", p: "Le droit de la consommation ne s'applique pas entre particuliers ; la garantie des vices cachés reste applicable. La plateforme offre une procédure de litige." },
    { h: "Litiges et médiation", p: "Tout litige peut être signalé depuis la commande. Coordonnées du médiateur de la consommation : à compléter. Plateforme européenne de règlement en ligne des litiges : à mentionner." },
  ] },
  confidentialite: { title: "Politique de confidentialité", sections: [
    { h: "Responsable de traitement", p: "À compléter (raison sociale, adresse, DPO)." },
    { h: "Données traitées et finalités", p: "Compte et authentification (exécution du contrat), annonces et transactions (exécution du contrat), lutte contre la fraude (intérêt légitime), obligations comptables et fiscales dont DAC7 (obligation légale), mesure d'audience et attribution d'affiliation (consentement)." },
    { h: "Durées de conservation", p: "Compte : durée de la relation + 3 ans ; transactions : 10 ans (obligations comptables) ; journaux de sécurité : 1 an ; preuve du consentement cookies : 6 mois après expiration. À valider par le DPO." },
    { h: "Destinataires", p: "Prestataire de paiement (vérification d'identité, paiements), hébergeur, prestataire d'e-mails, administration fiscale (DAC7). Aucun transfert hors UE sans garanties appropriées." },
    { h: "Vos droits", p: "Accès, rectification, effacement, portabilité, opposition, limitation : depuis « Mon compte > Mes données » ou par e-mail. Réclamation possible auprès de la CNIL." },
  ] },
  cookies: { title: "Politique cookies", sections: [
    { h: "Cookies indispensables", p: "Session de connexion (m3x_session), préférences de consentement (m3x_consent, 6 mois). Exemptés de consentement." },
    { h: "Attribution des ventes (soumis à consentement)", p: "m3x_ref : mémorise jusqu'à 30 jours le lien commercial d'un indépendant afin de lui attribuer la vente. Sans consentement, l'attribution n'est possible que si vous achetez lors de la même visite." },
    { h: "Mesure d'audience (soumis à consentement)", p: "Aucun outil tiers n'est installé par défaut. Tout outil ajouté devra respecter ce choix." },
    { h: "Modifier vos choix", p: "À tout moment depuis le lien « Gérer les cookies » en pied de page ou « Mon compte > Mes données »." },
  ] },
  collaboration: { title: "Règles de collaboration (particuliers, indépendants, fournisseurs)", sections: [
    { h: "Mandat de vente", p: "Le particulier confie à l'indépendant la commercialisation d'articles qu'il désigne. Il reste propriétaire des articles et vendeur au sens juridique ; l'indépendant agit comme intermédiaire rémunéré à la commission. Qualification du contrat (mandat, commission, apport d'affaires) à valider juridiquement." },
    { h: "Prix", p: "Le propriétaire fixe le prix affiché et un prix plancher. L'indépendant propose les modifications de prix ; elles ne s'appliquent qu'après validation du propriétaire." },
    { h: "Conditions financières", p: "Le taux de commission accepté est figé pour la durée du contrat. La commission est calculée par la plateforme et versée après validation de la vente. Les frais de plateforme sont prélevés sur la commission." },
    { h: "Récupération des articles", p: "En formule « service complet », l'indépendant est responsable de la garde, de la préparation et de l'expédition des articles qui lui sont remis. Assurance et responsabilité en cas de perte : à préciser juridiquement." },
    { h: "Liens commerciaux", p: "L'indépendant signale sa qualité de commercial rémunéré lorsqu'il recommande un produit (pratiques commerciales loyales, influence commerciale : loi n° 2023-451). Interdiction de l'auto-achat, du spam et de toute publicité trompeuse." },
    { h: "Statut de l'indépendant", p: "L'indépendant exerce sous statut professionnel (micro-entreprise, société) et déclare ses revenus. Les revenus perçus via la plateforme peuvent faire l'objet d'une déclaration DAC7." },
  ] },
  transparence: { title: "Transparence (DSA)", sections: [
    { h: "Point de contact", p: "Point de contact unique pour les autorités et les utilisateurs : à compléter." },
    { h: "Traçabilité des professionnels", p: "Les vendeurs professionnels fournissent leurs informations d'identification (raison sociale, SIRET, coordonnées) avant de pouvoir vendre (DSA art. 30)." },
    { h: "Modération", p: "Signalements, décisions motivées, possibilité de contestation ; rapport de transparence annuel à publier." },
  ] },
};

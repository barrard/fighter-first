import Characters from "../gameConfig/Characters.js";

export default {
    verifyCharacter: (id) => {
        return Characters.find((character) => character.id === id);
    },
};

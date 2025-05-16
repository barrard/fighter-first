import Characters from "../../react-fighter/src/gameConfig/Characters.js";

export default {
    verifyCharacter: (id) => {
        return Characters.find((character) => character.id === id);
    },
};

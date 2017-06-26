'use strict';
const ShapedModule = require('./../shaped-module');
const Roll20 = require('roll20-wrapper');

const roll20 = new Roll20();

module.exports = class SheetWorkerChatOutput extends ShapedModule {
  registerEventListeners(eventDispatcher) {
    eventDispatcher.registerAttributeChangeHandler('sheet_chat_output', this.displaySheetChatOutput.bind(this));
  }

  displaySheetChatOutput(chatAttr, prev, characterId, additionalOutput) {
    function replacer(match, p1, p2) {
      return roll20.getAttrByName(characterId, p2);
    }
    this.logger.debug('Chat output received: $$$', chatAttr);
    characterId = characterId || chatAttr.get('characterid');
// Received chat output may contain attributes without character name, look those up
    let sheetOutput = (chatAttr && chatAttr.get('current')) || '';
    const matchAttr = new RegExp('(@{(?!.*?\\|)(.*?)})', 'g');
    sheetOutput = sheetOutput.replace(matchAttr, replacer);
    additionalOutput = additionalOutput || '';
    const text = `${sheetOutput}${additionalOutput}`;
    if (text && text.length > 0) {
      const templateText = `&{template:5e-shaped} ${text}`;
      this.reporter.sendCharacter(characterId, templateText);
      if (chatAttr) {
        chatAttr.set('current', '');
      }
    }
  }
};

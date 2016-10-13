'use strict';

/* globals describe: false, it:false, before:false, after:false */
const expect = require('chai').expect;
const utils = require('../lib/utils');
const EntityLookup = require('../lib/entity-lookup');
const JSONValidator = require('../lib/json-validator');
const spec = require('../resources/mmFormatSpec.json');
const glob = require('glob');
const fs = require('fs');
const sinon = require('sinon');

class DummyResultReporter {
  constructor() {
    this.results = {};
  }

  report(result) {
    this.results[result.entityGroupName] = result;
  }
}

describe('entity-lookup', function () {
  const spell1 = { name: 'spell1' };
  const spell2 = { name: 'spell2' };

  const monster1 = { name: 'monster1', spells: 'spell1, spell2' };
  const monster2 = { name: 'monster2' };
  const monster3 = { name: 'monster3', spells: 'spell1' };


  describe('#lookupEntity', function () {
    const el = new EntityLookup();
    el.configureEntity('spells', [el.getMonsterSpellUpdater()]);
    el.configureEntity('monsters', [el.getSpellHydrator()]);
    el.addEntities({ version: '0.2', spells: [spell1, spell2] });
    it('finds entity by name', function () {
      expect(el.findEntity('spells', 'SPell1')).to.deep.equal(spell1);
    });


    it('no match with bad whitespace', function () {
      expect(el.findEntity('spells', 'spel l2')).to.be.undefined;
    });

    it('matches ignoring whitespace', function () {
      expect(el.findEntity('spells', 'spel l2', true)).to.deep.equal(spell2);
    });
  });

  describe('#addEntities', function () {
    const el = new EntityLookup();
    el.configureEntity('spells', [el.getMonsterSpellUpdater()]);
    el.configureEntity('monsters', [el.getSpellHydrator()]);
    it('should hydrate spells', function () {
      el.addEntities({ version: '0.2', monsters: utils.deepClone([monster1, monster2]) });
      expect(el.findEntity('monsters', 'monster1')).to.deep.equal({
        name: 'monster1',
        spells: ['spell1', 'spell2'],
      });
      el.addEntities({ version: '0.2', spells: utils.deepClone([spell1, spell2]) });
      expect(el.findEntity('monsters', 'monster1')).to.deep.equal({ name: 'monster1', spells: [spell1, spell2] });
      el.addEntities({ version: '0.2', monsters: utils.deepClone([monster3]) });
      expect(el.findEntity('monsters', 'monster3')).to.deep.equal({ name: 'monster3', spells: [spell1] });
    });
  });

  describe('#entitySearch', function () {
    const el = new EntityLookup();
    el.configureEntity('spells');
    el.addEntities({
      spells: [
        {
          name: 'spell1',
          attribute: 'att1',
          multiAttribute: 'val1, val2',
          boolVal: true,
          intVal: 1,
          arrayVal: ['one', 'two', 'three'],
        },
        {
          name: 'spell2',
          attribute: 'att2',
          multiAttribute: 'val3, val2',
          boolVal: false,
          intVal: 10,
        },
      ],
    });

    it('should filter entities in search correctly', function () {
      let results = el.searchEntities('spells', { multiAttribute: 'val2' });
      expect(results).to.have.lengthOf(2);
      results = el.searchEntities('spells', { multiAttribute: 'val2', attribute: 'att1' });
      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.have.property('name', 'spell1');
    });

    it('should filter by boolean properly', function () {
      let results = el.searchEntities('spells', { boolVal: true });
      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.have.property('name', 'spell1');
      results = el.searchEntities('spells', { boolVal: false });
      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.have.property('name', 'spell2');
    });

    it('should filter by integer properly', function () {
      const results = el.searchEntities('spells', { intVal: 1 });
      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.have.property('name', 'spell1');
    });

    it('should filter by array properly', function () {
      const results = el.searchEntities('spells', { arrayVal: ['one'] });
      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.have.property('name', 'spell1');
    });

    it('should return empty for unknown properties', function () {
      expect(el.searchEntities('spells', 'fooVal')).to.have.lengthOf(0);
    });
  });

  describe('dependencies', function () {
    let clock;
    before(function () {
      clock = sinon.useFakeTimers();
    });

    it('fails for unmet dependency', function () {
      const el = new EntityLookup();
      const rr = new DummyResultReporter();

      el.configureEntity('spells');
      el.addEntities({ version: '1.0', name: 'derivative', spells: [], dependencies: 'base' }, rr);
      expect(rr.results).to.be.empty;
      clock.tick(10001);
      expect(rr.results.derivative.errors).to.deep.equal([{
        entity: 'Missing dependencies',
        errors: [
          'Entity group is missing dependencies [base]',
        ],
      }]);
    });

    it('works for met dependency', function () {
      const el = new EntityLookup();
      const rr = new DummyResultReporter();
      el.configureEntity('spells');
      el.addEntities({ version: '1.0', name: 'derivative', spells: [], dependencies: 'base' }, rr);
      expect(rr.results).to.be.empty;
      el.addEntities({ version: '1.0', name: 'base', spells: [] }, rr);
      expect(rr.results).to.have.property('base');
      expect(rr.results).to.have.property('derivative');
      expect(rr.results.base.errors).to.be.empty;
      expect(rr.results.derivative.errors).to.be.empty;
    });

    after(function () {
      clock.restore();
    });
  });

  describe('functional test', function () {
    const el = new EntityLookup();
    const jv = new JSONValidator(spec);
    el.configureEntity('spells', [el.getMonsterSpellUpdater()], EntityLookup.getVersionChecker('0.2'));
    el.configureEntity('monsters', [
      EntityLookup.jsonValidatorAsEntityProcessor(jv),
      el.getSpellHydrator(),
    ], EntityLookup.jsonValidatorAsVersionChecker(jv));
    glob.sync('../roll20/data/spellSourceFiles/spellData.json').forEach(function (jsonFile) {
      const spells = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
      it('loads spells correctly', function () {
        const rr = new DummyResultReporter();
        spells.name = 'spells';
        el.addEntities(spells, rr);
        const results = rr.results.spells;
        expect(results.spells.skipped).to.be.empty;
        expect(results.spells.deleted).to.be.empty;
        expect(results.spells.patched).to.be.empty;
        expect(results.spells.withErrors).to.be.empty;
        expect(results.errors).to.be.empty;
        expect(results.spells.added).to.have.lengthOf(spells.spells.length);
      });
    });

    glob.sync('../roll20/data/monsterSourceFiles/*.json').forEach(function (jsonFile) {
      const monsters = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
      it(`loads ${jsonFile} correctly`, function () {
        const rr = new DummyResultReporter();
        const name = jsonFile.replace(/\.json/, '');
        monsters.name = name;
        el.addEntities(monsters, rr);
        const results = rr.results[name];
        expect(results.errors).to.be.empty;
        expect(results.monsters.skipped).to.be.empty;
        expect(results.monsters.deleted).to.be.empty;
        expect(results.monsters.patched).to.be.empty;
        expect(results.monsters.withErrors).to.be.empty;
        expect(results.monsters.added).to.have.lengthOf(monsters.monsters.length);
      });
    });
  });
});


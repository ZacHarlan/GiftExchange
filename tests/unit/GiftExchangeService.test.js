const { GiftExchangeService } = require('../../script.js');

describe('GiftExchangeService', () => {
    let service;

    beforeEach(() => {
        service = new GiftExchangeService();
    });

    test('should add a person correctly', () => {
        const person = service.addPerson('John', 'Doe', 'Doe Family');
        expect(service.getPeople()).toHaveLength(1);
        expect(person.firstName).toBe('John');
        expect(person.lastName).toBe('Doe');
        expect(person.familyGroup).toBe('Doe Family');
    });

    test('should default familyGroup to lastName if not provided', () => {
        const person = service.addPerson('John', 'Doe');
        expect(person.familyGroup).toBe('Doe');
    });

    test('should throw error when adding duplicate name', () => {
        service.addPerson('John', 'Doe');
        expect(() => {
            service.addPerson('John', 'Doe');
        }).toThrow();
    });

    test('should throw error if shuffling with less than 2 people', () => {
        service.addPerson('John', 'Doe');
        expect(() => {
            service.shuffleAndAssign();
        }).toThrow('Please add at least 2 people.');
    });

    test('should shuffle and assign correctly for simple case', () => {
        service.addPerson('Alice', 'A', 'GroupA');
        service.addPerson('Bob', 'B', 'GroupB');

        const assignments = service.shuffleAndAssign();
        expect(assignments).toHaveLength(2);

        // Alice -> Bob, Bob -> Alice
        const aliceAssignment = assignments.find(a => a.giver === 'Alice A');
        expect(aliceAssignment.receiver).toBe('Bob B');
    });

    test('should respect restricted matching (Core vs Other)', () => {
        service.setCoreFamilies(['Rice', 'Harlan']);
        // Core: Rice, Harlan
        service.addPerson('Mindy', 'Rice', 'Rice');
        service.addPerson('Zac', 'Harlan', 'Harlan');

        // Other: Doe
        service.addPerson('John', 'Doe', 'Doe1');
        service.addPerson('Jane', 'Doe', 'Doe2');

        const assignments = service.shuffleAndAssign();

        const mindy = assignments.find(a => a.giver === 'Mindy Rice');
        const zac = assignments.find(a => a.giver === 'Zac Harlan');
        const john = assignments.find(a => a.giver === 'John Doe');
        const jane = assignments.find(a => a.giver === 'Jane Doe');

        // Core should match Core
        expect(['Zac Harlan', 'Mindy Rice']).toContain(mindy.receiver);
        expect(['Zac Harlan', 'Mindy Rice']).toContain(zac.receiver);

        // Other should match Other
        expect(['John Doe', 'Jane Doe']).toContain(john.receiver);
        expect(['John Doe', 'Jane Doe']).toContain(jane.receiver);
    });

    test('should throw error if a pool has only 1 person', () => {
        service.setCoreFamilies(['Rice', 'Harlan']);
        service.addPerson('Mindy', 'Rice', 'Rice'); // Core
        service.addPerson('John', 'Doe', 'Doe1');   // Other
        service.addPerson('Jane', 'Doe', 'Doe2');   // Other

        expect(() => {
            service.shuffleAndAssign();
        }).toThrow(/Only 1 person in the Core families/);
    });

    test('should throw error if a pool is unmatchable (same family group)', () => {
        service.addPerson('John', 'Doe', 'SameGroup');
        service.addPerson('Jane', 'Doe', 'SameGroup');

        // Need valid core group to isolate the error to Other pool
        service.setCoreFamilies(['Rice', 'Harlan']);
        service.addPerson('Mindy', 'Rice', 'Rice');
        service.addPerson('Zac', 'Harlan', 'Harlan');

        expect(() => {
            service.shuffleAndAssign();
        }).toThrow(/Cannot match non-Core group: All members are in the same family group/);
    });

    test('should allow configuring core families', () => {
        service.setCoreFamilies(['Doe']);

        service.addPerson('John', 'Doe', 'Doe');
        service.addPerson('Jane', 'Doe', 'Doe2');

        service.addPerson('Mindy', 'Rice', 'Rice1');
        service.addPerson('Zac', 'Rice', 'Rice2');

        const assignments = service.shuffleAndAssign();

        const john = assignments.find(a => a.giver === 'John Doe');
        expect(['John Doe', 'Jane Doe']).toContain(john.receiver);
    });

    test('should normalize/de-dupe core families and display them', () => {
        service.setCoreFamilies(['  Rice ', 'rice', '', 'Harlan']);
        expect(service.getCoreFamilies()).toEqual(['Rice', 'Harlan']);
        expect(service.getCoreFamiliesDisplay()).toBe('Rice, Harlan');
        expect(service.isCoreLastName('RICE')).toBe(true);
        expect(service.isCoreLastName('Other')).toBe(false);

        service.setCoreFamilies([]);
        expect(service.getCoreFamiliesDisplay()).toBe('None');
    });

    test('should throw when non-core pool has only 1 person', () => {
        service.setCoreFamilies(['Core']);
        service.addPerson('One', 'Core', 'CoreGroup1');
        service.addPerson('Two', 'Core', 'CoreGroup2');
        service.addPerson('Lonely', 'Other', 'OtherGroup');

        expect(() => service.shuffleAndAssign()).toThrow(/Only 1 person in the non-Core group/);
    });

    test('should fail after 10 retries if no valid assignments are found', () => {
        service.setCoreFamilies([]);
        service.addPerson('Alice', 'A', 'GroupA');
        service.addPerson('Bob', 'B', 'GroupB');

        // Force generator to fail
        jest.spyOn(service, '_generateAssignments').mockReturnValue(null);

        expect(() => service.shuffleAndAssign()).toThrow(/after 10 attempts/);
    });
});

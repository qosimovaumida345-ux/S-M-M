const { faker } = require('@faker-js/faker');

// ============================================================
// REAL IDENTITY GENERATOR
// Replaces static fake arrays with highly realistic, localized data
// Reduces behavioral detection significantly
// ============================================================

function generateIdentity(locale = 'en') {
    // We can set localization if needed, defaulting to US English for broad acceptance
    
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const displayName = `${firstName} ${lastName}`;
    
    // Create a realistic username, e.g., john.smith99 or smithj_88
    const usernameFormats = [
        `${firstName.toLowerCase()}.${lastName.toLowerCase()}${faker.number.int({ min: 10, max: 999 })}`,
        `${firstName.toLowerCase()}${lastName.toLowerCase()}${faker.number.int({ min: 1980, max: 2005 })}`,
        `${lastName.toLowerCase()}_${firstName.toLowerCase()}${faker.string.alphanumeric(3)}`
    ];
    const username = usernameFormats[Math.floor(Math.random() * usernameFormats.length)];

    // Secure, realistic password
    const password = faker.internet.password({ length: 12, memorable: false, pattern: /[A-Za-z0-9!@#$%^&*]/ }) + 'A1!';
    
    // Realistic DOB (18 to 35 years old)
    const dobDate = faker.date.birthdate({ min: 18, max: 35, mode: 'age' });
    const dob = {
        year: dobDate.getFullYear(),
        month: dobDate.getMonth() + 1,
        day: dobDate.getDate()
    };
    
    const bio = faker.person.bio();

    return {
        firstName,
        lastName,
        displayName,
        username,
        password,
        dob,
        bio
    };
}

module.exports = {
    generateIdentity
};
